"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { CodeGraphView, type ViewGraph, type ViewNode } from "../components/CodeGraphView";
import { ProjectConnection, type ConnectedProject } from "../components/ProjectConnection";
import { FocusInputControls } from "../components/FocusInputControls";
import type { ConfirmedFocus, FocusSnapshot } from "@/lib/focus/input-contracts";
import { AgentGlyph } from "../components/AgentGlyph";
import { CodeFocus, type CodeSourceRequest } from "../components/CodeFocus";
import type { CodeSourceFocus } from "@/lib/codegraph/source";
import { key, sessionToken, zone } from "../zones/client";
import s from "../zones/zones.module.css";
import { FlowRail, type FlowStage } from "./FlowRail";

// Teammate workspace: LEFT Team Memory (doubts + escalation) and RIGHT Code
// Navigator (graph). CENTER is visible but locked unless the server says otherwise.
// ← / → (or click) selects; selection is sent as a low-privilege focus event.

type Me = { participant?: { name: string }; role?: string; zones?: Record<string, { allowed: boolean; reason?: string }>; snapshot?: { label: string; pinnedSha: string; repository: string }; error?: string };
type Mem = { kind: string; speak: string; offerEscalation: boolean; sources: { kind: string; label: string }[]; question: string; provisional: { text: string }[]; pendingTicket?: { id: string } | null };
type GA = { explanation: string[]; match: string; seed: { label: string; path: string; line: number } | null; subgraph: { nodes: string[] }; graph: ViewGraph; sha: string; repository: string };
type Ticket = { id: string; question: string; state: string; answer?: { statement: string; conditions?: string; approvedBy: string; decisionVersion: number } };

export default function Team() {
  const [expanded, setExpanded] = useState(false);
  const [sessionLink, setSessionLink] = useState("");
  const [connecting, setConnecting] = useState(true);
  const [asking, setAsking] = useState(false);
  const [finding, setFinding] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [focus, setFocus] = useState<"team_memory" | "leader_desk" | "code_navigator">("team_memory");
  const [q, setQ] = useState("What did we agree in the meeting?");
  const [mem, setMem] = useState<Mem | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const escalation = useRef<{ question: string; id: string; pending: boolean } | null>(null);
  const [sending, setSending] = useState(false);
  const [cq, setCq] = useState("where do we read back before saying saved");
  const [ga, setGa] = useState<GA | null>(null);
  const [sourceRequest, setSourceRequest] = useState<CodeSourceRequest | null>(null);
  const [sourceRefresh, setSourceRefresh] = useState(0);
  const openGraphSource = useCallback((node: ViewNode) => setSourceRequest({ path: node.path, line: node.line, id: key() }), []);
  const highlightSource = useCallback((source: CodeSourceFocus) => {
    setGa(current => current ? { ...current, subgraph: { nodes: current.graph.nodes.filter(node => node.path === source.path &&
      (["file", "test"].includes(node.kind) || source.highlights.some(h => node.line >= h.start && node.line <= h.end))).map(node => node.id) } } : current);
  }, []);
  const [error, setError] = useState("");
  const [inbox, setInbox] = useState<{ answered: Ticket[]; pending: Ticket[] }>({ answered: [], pending: [] });

  const refreshSession = useCallback(async () => {
    setConnecting(true); setError("");
    try {
      if (!sessionToken()) { setMe(null); return; }
      const r = await zone<Me>("me");
      if (r.status !== 200 || !r.data.participant) {
        setMe(null); setError("Your session has expired or is unavailable. Ask your team lead for a new personal session link."); return;
      }
      setMe(r.data);
    } catch { setMe(null); setError("The workspace could not connect. Check the connection and try again."); }
    finally { setConnecting(false); }
  }, []);
  useEffect(() => { void refreshSession(); }, [refreshSession]);
  const connect = async () => {
    try {
      const value = sessionLink.trim();
      const token = value.includes("#") ? new URLSearchParams(value.slice(value.indexOf("#") + 1)).get("t") : value;
      if (!token || !/^[A-Za-z0-9_-]{16,256}$/.test(token)) { setError("Paste the complete personal session link your team lead shared with you."); return; }
      sessionStorage.setItem("kkb_session", token); setSessionLink(""); await refreshSession();
    } catch { setError("This browser could not save the session. Allow session storage and try again."); }
  };
  const connected = Boolean(me?.participant);
  const selectSpace = useCallback(async (zoneName: "team_memory" | "leader_desk" | "code_navigator") => {
    try {
      const state = await zone<FocusSnapshot>("focus-input");
      if (state.status !== 200) throw new Error("Focus connection unavailable");
      if (state.data.input.provider === "airpods") throw new Error("Switch to Manual to select by click while AirPods owns the input.");
      const result = await zone("focus", { zone: zoneName, provider: state.data.input.provider, seq: state.data.focus.seq + 1, inputEpoch: state.data.input.epoch });
      if (result.status !== 200) throw new Error(result.data.error ?? "Selection could not be saved");
      setFocus(zoneName);
    } catch (e) { setError(e instanceof Error ? e.message : "Selection failed. Try again."); }
  }, []);
  const connectProject = useCallback((project: ConnectedProject) => {
    setGa({ graph: project.graph, sha: project.sha, repository: project.repository, seed: null, match: "candidate", explanation: [], subgraph: { nodes: [] } });
    void selectSpace("code_navigator");
  }, [selectSpace]);
  const followFocus = useCallback((next: ConfirmedFocus) => {
    if (next.zone) setFocus(next.zone);
  }, []);
  // Answers from the leader arrive here, also after a reconnect.
  useEffect(() => {
    if (!connected) return;
    const poll = () => zone<{ answered: Ticket[]; pending: Ticket[] }>("deliveries").then((r) => {
      if (r.status === 200 && r.data.answered) { setInbox({ answered: r.data.answered, pending: r.data.pending }); setError(previous => previous === "Answers could not refresh. Retrying…" ? "" : previous); }
    }).catch(() => setError("Answers could not refresh. Retrying…"));
    poll(); const id = setInterval(poll, 3000); return () => clearInterval(id);
  }, [connected]);

  const ask = async () => {
    if (!connected || asking || !q.trim()) return;
    setAsking(true); setSent(null); setError(""); setMem(null);
    try { const r = await zone<Mem>("memory_ask", { question: q });
      if (r.status !== 200 || !r.data.kind) throw new Error(r.data.error ?? "Memory unavailable");
      setMem(r.data);
    } catch (e) { setError((e as Error).message); }
    finally { setAsking(false); }
  };
  const escalate = async () => {
    const question = mem?.question ?? q;
    if (escalation.current?.pending) return;
    if (escalation.current?.question !== question) escalation.current = { question, id: key(), pending: false };
    const attempt = escalation.current!;
    attempt.pending = true; setSending(true);
    try { const r = await zone<{ ticket: Ticket }>("ticket_create", { question, confirmed: true, idempotency_key: attempt.id });
      setSent(r.data.ticket ? `Sent to the leader as ${r.data.ticket.id}. I won't guess; you'll see the answer here.` : r.data.error ?? "not sent");
    } catch { setError("Question could not be sent. Try again."); }
    finally { attempt.pending = false; setSending(false); }
  };
  const navigate = async () => {
    if (!connected || finding || !cq.trim()) return;
    setFinding(true); setError(""); setGa(null);
    try { const r = await zone<GA>("code_graph_query", { question: cq });
      if (r.status !== 200 || !r.data.graph || !r.data.subgraph) throw new Error(r.data.error ?? "Code graph unavailable");
      setGa(r.data);
      setSourceRefresh(n => n + 1);
    } catch (e) { setError((e as Error).message); }
    finally { setFinding(false); }
  };

  // Where the user's current question is on its way (drives the flow rail).
  const flowBranch: "leader" | "code" | null = focus === "code_navigator" || ga?.seed ? "code" : focus === "leader_desk" || sent || inbox.pending.length ? "leader" : null;
  const flowStage: FlowStage = ga?.seed || (flowBranch === "code" && finding) ? 4 : sent || inbox.pending.length || inbox.answered.length ? 3 : mem ? 2 : asking ? 1 : 0;
  const flowBusy = asking || finding || sending;

  return (
    <main className={`${s.page} ${s.teamPage}`} data-expanded={expanded} data-focus={focus}>
      <div className={s.workspaceShell}>
      <div className={s.top}>
        <h1 className={s.title}>Kaam Ki Baat <span className={s.workspaceName}>/ Workspace</span></h1>
        <div className={s.meta}>{me?.snapshot && <><span className={s.badge}>{me.snapshot.label}</span> {me.snapshot.repository} @ {me.snapshot.pinnedSha.slice(0, 7)}</>}</div>
      </div>
      <section className={s.welcome} aria-labelledby="workspace-heading">
        <div>
          <div className={s.label}>From team decisions to your next step</div>
          <h2 id="workspace-heading">Your project, in context.</h2>
          <p>Connect your repository. Ask a question. Follow the code.</p>
        </div>
        <div className={s.connection} role="status"><span className={connected ? s.ok : s.warn}>●</span> {connecting ? "Checking your session…" : connected ? `Connected as ${me!.participant!.name}` : "Connect your personal session"}</div>
      </section>
      <FlowRail stage={flowStage} busy={flowBusy} branch={flowBranch} />
      {!connected && !connecting && <section className={s.connectCard} aria-label="Connect to workspace">
        <div><h2>Your workspace starts with a personal link</h2><p>Your team lead shares a link that gives you access to your permitted meetings and repository. Paste it here to connect.</p></div>
        <form className={s.row} onSubmit={e => { e.preventDefault(); void connect(); }}>
          <input className={s.input} type="password" autoComplete="off" value={sessionLink} onChange={e => setSessionLink(e.target.value)} placeholder="Paste your personal session link" aria-label="Personal session link" />
          <button className={`${s.btn} ${s.primary}`} disabled={!sessionLink.trim() || connecting}>Connect</button>
        </form>
      </section>}
      {connected && <ProjectConnection selectedZone={focus} repository={me!.snapshot?.repository ?? "harshsinha-12/kaam-ki-baat"} onConnected={connectProject} />}
      {connected && <FocusInputControls compact key={me!.participant!.name} onConfirmedFocus={followFocus} />}
      {error && <p className={s.bad} role="alert">{error}</p>}
      <div className={s.workspaceHeading}><div><span className={s.label}>Your workspace</span><h2>Three perspectives. One conversation.</h2></div><button className={s.textButton} aria-pressed={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? "Show project controls ↙" : "Expand workspace ↗"}</button></div>
      <div className={s.zones} role="group" aria-label="Workspace areas">
        <button data-zone="team_memory" className={`${s.zbtn} ${focus === "team_memory" ? s.zbtnOn : ""}`} disabled={!connected} aria-pressed={focus === "team_memory"} onClick={() => void selectSpace("team_memory")}><AgentGlyph zone="team_memory" size={36} /><span><strong>Team Memory</strong><small>Meeting context</small></span><span className={s.zoneKey} aria-hidden="true">←</span></button>
        <button data-zone="leader_desk" className={`${s.zbtn} ${s.lock} ${focus === "leader_desk" ? s.centerSelected : ""}`} disabled={!connected} aria-pressed={focus === "leader_desk"} onClick={() => void selectSpace("leader_desk")} title={me?.zones?.leader_desk?.reason ?? "Leader access requires a verified leader session"}><AgentGlyph zone="leader_desk" size={36} /><span><strong>Leader Desk</strong><small>Verified leader access</small></span><span className={s.zoneKey} aria-hidden="true">↑</span></button>
        <button data-zone="code_navigator" className={`${s.zbtn} ${focus === "code_navigator" ? s.zbtnOn : ""}`} disabled={!connected} aria-pressed={focus === "code_navigator"} onClick={() => void selectSpace("code_navigator")}><AgentGlyph zone="code_navigator" size={36} /><span><strong>Code Navigator</strong><small>Repository &amp; source</small></span><span className={s.zoneKey} aria-hidden="true">→</span></button>
      </div>

      {focus === "leader_desk" && <section className={`${s.card} ${s.activeC} ${s.leaderHint}`} role="status"><div><div className={s.label}>Center selected</div><h2>Leader Desk</h2><p>Charan is the team leader. Use the project voice guide above to clear repository doubts. Human-approved decisions require leader verification.</p></div><a className={s.btn} href="/leader">Leader verification ↗</a></section>}
      <div className={s.grid}>
        <section data-zone="team_memory" className={`${s.card} ${focus === "team_memory" ? s.active : ""}`}>
          <div className={s.cardHeading}><span className={s.zoneNumber}>01 / MEMORY</span><span className={s.cardTag}>Approved meeting notes</span></div>
          <h2 className={s.h}>What did we decide?</h2>
          <p className={s.cardDescription}>Pick up where your team left off.</p>
          <div className={s.row}>
            <input className={s.input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask()} aria-label="Ask Team Memory" />
            <button className={`${s.btn} ${s.primary}`} disabled={!connected || asking || !q.trim()} onClick={ask}>{asking ? "Looking up…" : "Ask"}</button>
          </div>
          {!mem && <div className={s.empty}><span className={s.label}>{asking ? "Reading permitted sources" : "Meeting notes → sourced answers"}</span><p>{asking ? "Checking your team’s approved notes…" : "Ask about a decision, commitment, or owner. If the notes do not confirm an answer, you can ask your leader."}</p></div>}
          {mem && (
            <div className={s.answer}>
              <div className={mem.kind === "confirmed" ? s.ok : mem.kind === "conditional" ? s.warn : s.bad}>● {mem.kind.replace("_", " ")}</div>
              <div style={{ marginTop: 6 }}>{mem.speak}</div>
              <div className={s.src}>{mem.sources.map((x, i) => <span key={i}>{x.kind} · {x.label}</span>)}{mem.provisional.map((p, i) => <span key={`p${i}`} className={s.warn}>live (provisional) · {p.text}</span>)}</div>
              {mem.offerEscalation && !mem.pendingTicket && !sent && <button className={s.btn} style={{ marginTop: 12 }} disabled={sending} onClick={escalate}>{sending ? "Sending…" : "Yes, ask the leader"}</button>}
              {sent && <p className={s.meta} style={{ marginTop: 10 }}>{sent}</p>}
            </div>
          )}
          <div className={s.list}>
            {inbox.answered.map((t) => (
              <div key={t.id} className={s.item}>
                <div className={s.ok}>Leader answered · v{t.answer?.decisionVersion}</div>
                <div>“{t.question}” → <b>{t.answer?.statement}</b>{t.answer?.conditions ? `, on condition that ${t.answer.conditions}` : ""}</div>
                {t.state !== "acknowledged" && <button className={s.btn} style={{ marginTop: 8 }} onClick={() => { void zone("delivery_ack", { ticket_id: t.id }).then(r => { if (r.status !== 200) setError(r.data.error ?? "Acknowledgement failed"); }).catch(() => setError("Acknowledgement failed. Try again.")); }}>Got it</button>}
              </div>
            ))}
            {inbox.pending.map((t) => <div key={t.id} className={s.item}><span className={s.warn}>Pending with the leader</span> · {t.question}</div>)}
          </div>
        </section>

        <section data-zone="code_navigator" id="code-navigator" className={`${s.card} ${focus === "code_navigator" ? s.activeR : ""}`}>
          <div className={s.cardHeading}><span className={s.zoneNumber}>03 / CODE</span><span className={s.cardTag}>Commit-pinned sources</span></div>
          <h2 className={s.h}>Where is it in the code?</h2>
          <p className={s.cardDescription}>Trace an idea to the exact implementation.</p>
          <div className={s.row}>
            <input className={s.input} value={cq} onChange={(e) => setCq(e.target.value)} onKeyDown={(e) => e.key === "Enter" && navigate()} aria-label="Ask Code Navigator" />
            <button className={`${s.btn} ${s.primary}`} disabled={!connected || finding || !cq.trim()} onClick={navigate}>{finding ? "Finding…" : "Find"}</button>
          </div>
          {ga ? <CodeGraphView graph={ga.graph} highlight={ga.subgraph.nodes} height={360} onPick={openGraphSource} /> : <div className={s.empty}><span className={s.label}>{finding ? "Searching pinned code" : "Question → graph → source"}</span><p>{finding ? "Finding relevant files and connections…" : "Ask where a behavior is implemented. Results link to a file and line at the selected commit. Graph connections are hints to verify in the source."}</p></div>}
          {ga && (
            <>
              {ga.seed && <a className={s.meta} href={`https://github.com/${ga.repository}/blob/${ga.sha}/${ga.seed.path}#L${ga.seed.line}`} target="_blank" rel="noreferrer">{ga.seed.path}:{ga.seed.line} @ {ga.sha.slice(0, 7)} ↗ · <span className={ga.match === "confirmed" ? s.ok : s.warn}>{ga.match}</span></a>}
              <a className={s.meta} href={`/graph?q=${encodeURIComponent(cq)}`}>See how it was found in the full graph →</a>
              <ol className={s.steps}>{ga.explanation.map((l, i) => <li key={i}>{l.replace(/^\d+\.\s*/, "")}</li>)}</ol>
            </>
          )}
          {connected && <CodeFocus request={sourceRequest} refreshKey={sourceRefresh} onFocus={highlightSource} />}
        </section>
      </div>
      <section id="workspace-settings" className={s.setupRow} aria-label="Workspace settings">
        <details className={s.setupDisclosure}><summary><span>A quick guide</span><small>Make yourself at home</small></summary><p className={s.setupHint}>Connect the approved GitHub URL above to open its graph. Start the voice guide to ask about code and documentation. Team Memory answers from approved meeting notes; unclear decisions can be sent to the verified team leader. Camera is off until you start it, and video stays on your device.</p></details>
      </section>
      <footer className={s.workspaceFooter}><span>Kaam Ki Baat</span><span>Grounded in your meetings. Connected to your code.</span></footer>
      </div>
    </main>
  );
}
