"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { CodeGraphView, type ViewGraph } from "../components/CodeGraphView";
import { ProjectConnection, type ConnectedProject } from "../components/ProjectConnection";
import { FocusInputControls } from "../components/FocusInputControls";
import type { ConfirmedFocus } from "@/lib/focus/input-contracts";
import { CodeFocus } from "../components/CodeFocus";
import { key, sessionToken, zone } from "../zones/client";
import s from "../zones/zones.module.css";

// Teammate workspace: LEFT Team Memory (doubts + escalation) and RIGHT Code
// Navigator (graph). CENTER is visible but locked unless the server says otherwise.
// ← / → (or click) selects; selection is sent as a low-privilege focus event.

type Me = { participant?: { name: string }; role?: string; zones?: Record<string, { allowed: boolean; reason?: string }>; snapshot?: { label: string; pinnedSha: string; repository: string }; error?: string };
type Mem = { kind: string; speak: string; offerEscalation: boolean; sources: { kind: string; label: string }[]; question: string; provisional: { text: string }[]; pendingTicket?: { id: string } | null };
type GA = { explanation: string[]; match: string; seed: { label: string; path: string; line: number } | null; subgraph: { nodes: string[] }; graph: ViewGraph; sha: string; repository: string };
type Ticket = { id: string; question: string; state: string; answer?: { statement: string; conditions?: string; approvedBy: string; decisionVersion: number } };

export default function Team() {
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
  const connectProject = useCallback((project: ConnectedProject) => {
    setGa({ graph: project.graph, sha: project.sha, repository: project.repository, seed: null, match: "candidate", explanation: [], subgraph: { nodes: [] } });
    setFocus("code_navigator");
  }, []);
  const followFocus = useCallback((next: ConfirmedFocus) => {
    if (next.zone) setFocus(next.zone);
  }, []);
  // Answers from the leader arrive here, also after a reconnect.
  useEffect(() => {
    if (!connected) return;
    const poll = () => zone<{ answered: Ticket[]; pending: Ticket[] }>("deliveries").then((r) => r.status === 200 && r.data.answered && setInbox({ answered: r.data.answered, pending: r.data.pending })).catch(() => setError("Answers could not refresh. Retrying…"));
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
    } catch (e) { setError((e as Error).message); }
    finally { setFinding(false); }
  };

  return (
    <main className={s.page}>
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
      {!connected && !connecting && <section className={s.connectCard} aria-label="Connect to workspace">
        <div><h2>Your workspace starts with a personal link</h2><p>Your team lead shares a link that gives you access to your permitted meetings and repository. Paste it here to connect.</p></div>
        <form className={s.row} onSubmit={e => { e.preventDefault(); void connect(); }}>
          <input className={s.input} type="password" autoComplete="off" value={sessionLink} onChange={e => setSessionLink(e.target.value)} placeholder="Paste your personal session link" aria-label="Personal session link" />
          <button className={`${s.btn} ${s.primary}`} disabled={!sessionLink.trim() || connecting}>Connect</button>
        </form>
      </section>}
      {connected && <ProjectConnection repository={me!.snapshot?.repository ?? "harshsinha-12/kaam-ki-baat"} onConnected={connectProject} />}
      <div className={s.setupRow}>
        <details className={s.setupDisclosure}><summary>Camera &amp; head tracking</summary><p className={s.setupHint}>Choose Webcam, start camera, then calibrate facing forward. Look left for meeting context, center for the leader, and right for code. Head movement highlights; activation is explicit.</p>{connected ? <FocusInputControls key={me!.participant!.name} onConfirmedFocus={followFocus} /> : <p>Connect your personal session to enable camera controls.</p>}</details>
        <details className={s.setupDisclosure}><summary>How to use this workspace</summary><p className={s.setupHint}>Connect the approved GitHub URL above to open its graph. Start the voice guide to ask about code and documentation. Team Memory answers from approved meeting notes; unclear decisions can be sent to the verified team leader. Camera is off until you start it, and video stays on your device.</p></details>
      </div>
      {error && <p className={s.bad} role="alert">{error}</p>}
      <div className={s.zones} role="group" aria-label="Workspace areas">
        <button className={`${s.zbtn} ${focus === "team_memory" ? s.zbtnOn : ""}`} disabled={!connected} aria-pressed={focus === "team_memory"} onClick={() => setFocus("team_memory")}><div className={s.label}>← Look left · meeting context</div>Team Memory</button>
        <button className={`${s.zbtn} ${s.lock} ${focus === "leader_desk" ? s.centerSelected : ""}`} disabled title={me?.zones?.leader_desk?.reason ?? "Leader access requires a verified leader session"}><div className={s.label}>↑ Face forward · access protected</div>Leader Desk</button>
        <button className={`${s.zbtn} ${focus === "code_navigator" ? s.zbtnOn : ""}`} disabled={!connected} aria-pressed={focus === "code_navigator"} onClick={() => setFocus("code_navigator")}><div className={s.label}>Look right → · codebase</div>Code Navigator</button>
      </div>

      {focus === "leader_desk" && <section className={`${s.card} ${s.activeC} ${s.leaderHint}`} role="status"><div><div className={s.label}>Center selected</div><h2>Leader Desk</h2><p>Charan is the team leader. Use the project voice guide above to clear repository doubts. Human-approved decisions require leader verification.</p></div><a className={s.btn} href="/leader">Leader verification ↗</a></section>}
      <div className={s.grid}>
        <section className={`${s.card} ${focus === "team_memory" ? s.active : ""}`}>
          <div className={s.label}>Team Memory · meeting context</div>
          <div className={s.h}>What did we decide?</div>
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

        <section id="code-navigator" className={`${s.card} ${focus === "code_navigator" ? s.activeR : ""}`}>
          <div className={s.label}>Code Navigator · graph of this repo</div>
          <div className={s.h}>Where is it in the code?</div>
          <div className={s.row}>
            <input className={s.input} value={cq} onChange={(e) => setCq(e.target.value)} onKeyDown={(e) => e.key === "Enter" && navigate()} aria-label="Ask Code Navigator" />
            <button className={`${s.btn} ${s.primary}`} disabled={!connected || finding || !cq.trim()} onClick={navigate}>{finding ? "Finding…" : "Find"}</button>
          </div>
          {ga ? <CodeGraphView graph={ga.graph} highlight={ga.subgraph.nodes} height={360} /> : <div className={s.empty}><span className={s.label}>{finding ? "Searching pinned code" : "Question → graph → source"}</span><p>{finding ? "Finding relevant files and connections…" : "Ask where a behavior is implemented. Results link to a file and line at the selected commit. Graph connections are hints to verify in the source."}</p></div>}
          {ga && (
            <>
              {ga.seed && <a className={s.meta} href={`https://github.com/${ga.repository}/blob/${ga.sha}/${ga.seed.path}#L${ga.seed.line}`} target="_blank" rel="noreferrer">{ga.seed.path}:{ga.seed.line} @ {ga.sha.slice(0, 7)} ↗ · <span className={ga.match === "confirmed" ? s.ok : s.warn}>{ga.match}</span></a>}
              <ol className={s.steps}>{ga.explanation.map((l, i) => <li key={i}>{l.replace(/^\d+\.\s*/, "")}</li>)}</ol>
            </>
          )}
          {connected && <CodeFocus />}
        </section>
      </div>
    </main>
  );
}
