"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BolnaWebCall } from "@bolna/web-call";
import { browserHandoff } from "@/lib/auth/browser-handoff";
import { evidenceUrl, type ActionReceipt, type PageState, type PendingAction, type Space, type SpatialContext } from "@/lib/spatial/contracts";
import { executeBrowserAction } from "@/lib/spatial/browser-actions";
import type { ConfirmedFocus } from "@/lib/focus/input-contracts";
import { FocusInputControls } from "./FocusInputControls";
import styles from "./spatial.module.css";

const INITIAL_PAGE: PageState = { space: "meeting", selectedEvidence: null, visibleTargets: [] };
const SPACES: { id: Space; title: string; hint: string }[] = [
  { id: "meeting", title: "← Meeting context", hint: "What was agreed" },
  { id: "code", title: "Codebase →", hint: "What the repository shows" },
];

export function SpatialWorkspace() {
  const [tokenInput, setTokenInput] = useState("");
  const [token, setToken] = useState("");
  const [context, setContext] = useState<SpatialContext | null>(null);
  const [centerSelected, setCenterSelected] = useState(false);
  const [page, setPage] = useState<PageState>(INITIAL_PAGE);
  const pageRef = useRef(page);
  const [error, setError] = useState("");
  const [actionResult, setActionResult] = useState("");
  const [webCallEnabled, setWebCallEnabled] = useState(false);
  const [callState, setCallState] = useState("idle");
  const callRef = useRef<BolnaWebCall | null>(null);
  const [Client, setClient] = useState<typeof BolnaWebCall | null>(null);
  const startingRef = useRef(false);
  const [consent, setConsent] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const updatePage = useCallback((next: PageState) => { setCenterSelected(false); pageRef.current = next; setPage(next); }, []);
  const selectSpace = (space: Space) => { setCenterSelected(false); updatePage({ ...pageRef.current, space, selectedEvidence: null }); };
  const followFocus = useCallback((focus: ConfirmedFocus) => {
    if (!focus.zone) return;
    setCenterSelected(focus.zone === "leader_desk");
    if (focus.zone !== "leader_desk") updatePage({ ...pageRef.current, space: focus.zone === "team_memory" ? "meeting" : "code", selectedEvidence: null });
  }, [updatePage]);

  useEffect(() => { const prepared = browserHandoff().callToken; if (prepared) setToken(prepared); }, []);

  useEffect(() => {
    if (!token) return;
    const boardKey = browserHandoff().boardKey;
    const controller = new AbortController();
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    let receipt: { id: string; result: ActionReceipt } | undefined;
    const executed = new Map<string, ActionReceipt>();
    const tick = async () => {
      try {
        const visibleTargets = [...document.querySelectorAll<HTMLElement>("[data-spatial-id]")]
          .filter(e => !e.closest("[hidden]") && e.getBoundingClientRect().bottom > 0 && e.getBoundingClientRect().top < window.innerHeight)
          .map(e => e.dataset.spatialId!).slice(0, 100);
        const response = await fetch("/api/spatial/browser", {
          method: "POST", cache: "no-store", signal: controller.signal,
          headers: { Authorization: `Bearer ${boardKey}`, "x-kkb-call-token": token, "Content-Type": "application/json" },
          body: JSON.stringify({ page: { ...pageRef.current, visibleTargets }, receipt }),
        });
        const data = await response.json() as { ok: boolean; error?: string; context: SpatialContext; actions: PendingAction[]; webCallEnabled: boolean };
        if (!alive) return;
        if (!response.ok || !data.ok) {
          if (response.status === 401 || response.status === 403) {
            setToken(""); setContext(null); setWebCallEnabled(false);
            void callRef.current?.stop();
          }
          throw new Error(data.error ?? "Could not sync the browser.");
        }
        receipt = undefined;
        setContext(data.context); setWebCallEnabled(data.webCallEnabled); setError("");
        for (const command of data.actions) {
          if (!alive || command.expiresAt <= Date.now()) continue;
          let result = executed.get(command.id);
          if (!result) {
            result = await executeBrowserAction(command.action, data.context, () => pageRef.current, updatePage);
            if (!alive) return;
            executed.set(command.id, result);
            if (executed.size > 100) executed.delete(executed.keys().next().value!);
          }
          receipt = { id: command.id, result };
          setActionResult(result.message);
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Browser sync failed.");
      } finally { if (alive) timer = setTimeout(tick, receipt ? 0 : 500); }
    };
    void tick();
    return () => { alive = false; controller.abort(); clearTimeout(timer); };
  }, [token, updatePage]);

  useEffect(() => () => { void callRef.current?.stop(); }, []);

  useEffect(() => {
    let alive = true;
    if (webCallEnabled) void import("@bolna/web-call").then(m => { if (alive) setClient(() => m.BolnaWebCall); }).catch(() => {
      if (alive) setError("Could not load the Bolna browser client.");
    });
    return () => { alive = false; };
  }, [webCallEnabled]);

  async function startCall() {
    if (!consent || !webCallEnabled || !token || !Client || startingRef.current || callRef.current && !["idle", "ended"].includes(callRef.current.getState())) return;
    startingRef.current = true;
    setCallState("connecting"); setError("");
    try {
      const key = browserHandoff().boardKey;
      const call = new Client({
        audioElement: audioRef.current!,
        getSession: async () => {
          const r = await fetch("/api/spatial/bolna-session", {
            method: "POST", headers: { Authorization: `Bearer ${key}`, "x-kkb-call-token": token, "Content-Type": "application/json" },
            body: JSON.stringify({ consented: true }),
          });
          if (!r.ok) throw new Error("Bolna browser session could not be created.");
          return r.json();
        },
      });
      call.on("state-change", setCallState);
      call.on("error", e => setError(e.message));
      callRef.current = call;
      await call.start();
    } catch (e) {
      await callRef.current?.stop(); setCallState("ended");
      setError(e instanceof Error ? e.message : "The call could not start.");
    } finally { startingRef.current = false; }
  }

  function disconnect() {
    void callRef.current?.stop(); setToken(""); setContext(null); setWebCallEnabled(false);
    setConsent(false); setActionResult(""); updatePage(INITIAL_PAGE);
  }

  return <section className={styles.workspace} aria-label="Spatial workspace">
    <div className={styles.heading}>
      <div><h2>One conversation. Two spaces.</h2><p>Meeting context on your left. Codebase on your right. Bolna keeps the conversation.</p></div>
      <span className={styles.badge}>Manual · Webcam · AirPods companion</span>
    </div>
    <FocusInputControls onConfirmedFocus={followFocus} />
    {centerSelected && <section className={styles.panel} aria-label="Leader Desk selection"><h3>Leader Desk selected</h3><p>Center selection grants no access. Activate explicitly after leader verification to use the desk.</p><a href="/leader">Open leader verification</a></section>}
    {!token ? <form className={styles.connect} onSubmit={e => {
      e.preventDefault(); setError(""); setToken(tokenInput.trim()); setTokenInput("");
    }}>
      <label htmlFor="spatial-call-token">Connect your participant session</label>
      <input id="spatial-call-token" type="password" autoComplete="off" required minLength={16} value={tokenInput} onChange={e => setTokenInput(e.target.value)} placeholder="Per-call token" />
      <button type="submit">Connect workspace</button>
      <p>Use the token from <code>npm run call:token</code>. It stays in this tab’s memory. The board key alone does not unlock meeting passages.</p>
    </form> : <>
      <nav className={styles.spaces} aria-label="Choose a workspace">
        <button aria-pressed={!centerSelected && page.space === "meeting"} onClick={() => selectSpace("meeting")}><strong>{SPACES[0].title}</strong><small>{SPACES[0].hint}</small></button>
        <button aria-pressed={centerSelected} onClick={() => setCenterSelected(true)}><strong>Leader Desk</strong><small>Center · leader verification required</small></button>
        <button aria-pressed={!centerSelected && page.space === "code"} onClick={() => selectSpace("code")}><strong>{SPACES[1].title}</strong><small>{SPACES[1].hint}</small></button>
      </nav>
      {!context ? <p role="status">Connecting your workspace…</p> : <>
        <p className={styles.provenance}><b>{context.snapshot.label}</b> · {context.snapshot.repository} @ <code>{context.snapshot.pinnedSha.slice(0, 7)}</code> · fetched {context.snapshot.fetchedAt}<br />
          {context.task ? `${context.task.title} · ownership: ${context.task.ownership}` : "No task is authorized for this session."}
        </p>
        <section hidden={centerSelected || page.space !== "meeting"} data-spatial-id="meeting" tabIndex={-1} className={styles.panel} aria-label="Meeting context">
          <h3>What was agreed</h3><p>Approved passages for your current task. These are excerpts, not a complete transcript.</p>
          {context.meetings.length === 0 && <p>No approved meeting passage is available for this task.</p>}
          {context.meetings.map(m => <article key={m.id}><h4>{m.title} <small>({m.source})</small></h4>{m.passages.map(p => <blockquote key={p.id}><p>{p.text}</p><footer>{p.speaker ?? "Unknown speaker"} · {p.id} · characters {p.charStart}–{p.charEnd}</footer></blockquote>)}</article>)}
        </section>
        <section className={styles.panel} aria-label="Shared Bolna conversation">
          <h3>Talk to Kaam Ki Baat</h3>
          <p>Try “What did we agree?”, “Show the codebase”, or “Focus Fix Navigator”. Switching spaces keeps the same call, task, and evidence.</p>
          {!webCallEnabled && <p>Browser calling awaits Bolna agent setup and authorization. You can connect this workspace to an existing authorized phone session using the same token.</p>}
          {webCallEnabled && <div className={styles.callControls}>
            <label><input type="checkbox" checked={consent} onChange={e => {
              setConsent(e.target.checked);
              if (!e.target.checked) void callRef.current?.stop();
            }} /> I consent to this Bolna test call and its recording.</label>
            <button onClick={() => void startCall()} disabled={!Client || !consent || !["idle", "ended"].includes(callState)}>Start Bolna call</button>
            <button onClick={() => void callRef.current?.stop()} disabled={["idle", "ended"].includes(callState)}>End call</button>
            <span role="status">{callState}</span>
          </div>}
          <h4>Conversation</h4>
          {!context.turns.length && <p>The conversation appears when Bolna uses the evidence tools.</p>}
          {context.turns.map((t, i) => <div key={`${t.at}-${i}`} className={styles.turn}><small>{t.specialist.replaceAll("_", " ")}</small><p>“{t.utterance || "…"}”</p><p>{t.spoken}</p></div>)}
          <h4>Not yet acknowledged</h4>
          {context.outstanding.length ? context.outstanding.map(o => <p key={o.id}>{o.fact} <small>(said {o.attempts}×)</small></p>) : <p>No outstanding facts.</p>}
        </section>
        <section hidden={centerSelected || page.space !== "code"} data-spatial-id="code" tabIndex={-1} className={styles.panel} aria-label="Codebase">
          <h3>What the repository shows</h3><p>Evidence at the pinned commit. Ask Bolna to find, locate, or verify code using the existing specialists.</p>
          <div className={styles.cards}>{context.cards.map(c => <article key={c.id} data-spatial-id={c.id} tabIndex={-1} className={page.selectedEvidence === c.id ? styles.selected : ""}>
            <h4>{c.label}</h4><p>{c.summary}</p>
            {!c.evidence.length && <small>No evidence returned yet.</small>}
            {c.evidence.map(e => { const url = evidenceUrl(e.url, context.snapshot.repository); const finding = context.findings.find(f => f.id === e.id); return <div key={e.id} data-spatial-id={e.id} tabIndex={-1} className={page.selectedEvidence === e.id ? styles.selected : styles.evidence}>
              <button onClick={() => updatePage({ ...pageRef.current, selectedEvidence: e.id })}>{e.label}</button>
              {e.match && <small>{e.match}</small>}{url && <a href={url} target="_blank" rel="noopener noreferrer">Open source ↗</a>}
              {finding && page.selectedEvidence === e.id && <div><p><code>{finding.path}:{finding.lineStart}–{finding.lineEnd}</code>{finding.symbol && ` · ${finding.symbol}`} · {finding.match}</p><pre className={styles.source}><code>{finding.excerpt}</code></pre></div>}
            </div>; })}
          </article>)}</div>
        </section>
      </>}
      <div className={styles.footer}><span>Selected space: {page.space} · browser session</span><button onClick={disconnect}>Disconnect workspace</button></div>
    </>}
    <audio ref={audioRef} autoPlay />
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <p role="status" aria-live="polite">{actionResult}</p>
  </section>;
}
