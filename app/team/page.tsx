"use client";
import { useCallback, useEffect, useReducer, useRef, useState, type CSSProperties } from "react";
import { CodeGraphView, type ViewGraph, type ViewNode } from "../components/CodeGraphView";
import { ProjectConnection, type ConnectedProject } from "../components/ProjectConnection";
import { FocusInputControls } from "../components/FocusInputControls";
import type { ConfirmedFocus, FocusSnapshot } from "@/lib/focus/input-contracts";
import { AgentGlyph } from "../components/AgentGlyph";
import { CodeFocus, type CodeSourceRequest } from "../components/CodeFocus";
import type { CodeSourceFocus } from "@/lib/codegraph/source";
import { connectWorkspaceSession, key, zone } from "../zones/client";
import s from "../zones/zones.module.css";
import { FlowRail } from "./FlowRail";
import { flowReducer, initialFlow } from "./flow-state";

// Teammate workspace: LEFT Team Memory (doubts + escalation) and RIGHT Code
// Navigator (graph). CENTER is visible but locked unless the server says otherwise.
// ← / → (or click) selects; selection is sent as a low-privilege focus event.

type Me = { participant?: { name: string }; role?: string; zones?: Record<string, { allowed: boolean; reason?: string }>; snapshot?: { label: string; pinnedSha: string; repository: string }; error?: string };
type Mem = { kind: string; speak: string; offerEscalation: boolean; sources: { kind: string; label: string; url?: string }[]; question: string; provisional: { text: string }[]; pendingTicket?: { id: string } | null };
type Meeting = { id: string; title: string; source: string; date?: string; fetchedAt?: string; passageCount: number; shareLink?: string };
type GA = { explanation: string[]; match: string; seed: { label: string; path: string; line: number } | null; subgraph: { nodes: string[] }; graph: ViewGraph; sha: string; repository: string };
type Ticket = { id: string; question: string; state: string; answer?: { statement: string; conditions?: string; approvedBy: string; decisionVersion: number } };

export default function Team() {
  const [flow, dispatchFlow] = useReducer(flowReducer, initialFlow);
  const flowRequestId = useRef(0);
  const [expanded, setExpanded] = useState(false);
  const [connecting, setConnecting] = useState(true);
  const [asking, setAsking] = useState(false);
  const [finding, setFinding] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [focus, setFocus] = useState<"team_memory" | "leader_desk" | "code_navigator">("team_memory");
  const [q, setQ] = useState("What did we agree in the meeting?");
  const [mem, setMem] = useState<Mem | null>(null);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [meetingId, setMeetingId] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const escalation = useRef<{ question: string; meetingId: string; id: string; pending: boolean } | null>(null);
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
    setConnecting(true); setError(""); setMeetings([]); setMeetingId(""); setMem(null);
    try {
      await connectWorkspaceSession();
      const r = await zone<Me>("me");
      if (r.status !== 200 || !r.data.participant) {
        setMe(null); setError("The workspace could not connect. Please retry."); return;
      }
      setMe(r.data);
      const sources = await zone<{ meetings: Meeting[] }>("memory_sources");
      if (sources.status === 200) setMeetings(sources.data.meetings);
    } catch { setMe(null); setError("The workspace could not connect. Check the connection and try again."); }
    finally { setConnecting(false); }
  }, []);
  useEffect(() => { void refreshSession(); }, [refreshSession]);
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
    const requestId = ++flowRequestId.current;
    dispatchFlow({ type: "start", requestId, destination: "memory" });
    setAsking(true); setSent(null); setError(""); setMem(null);
    try { const r = await zone<Mem>("memory_ask", { question: q, meeting_id: meetingId || undefined });
      if (r.status !== 200 || !r.data.kind) throw new Error(r.data.error ?? "Memory unavailable");
      setMem(r.data);
      dispatchFlow({ type: "finish", requestId, success: true });
    } catch (e) { setError((e as Error).message); dispatchFlow({ type: "finish", requestId, success: false }); }
    finally { setAsking(false); }
  };
  const escalate = async () => {
    const question = mem?.question ?? q;
    if (escalation.current?.pending) return;
    const requestId = ++flowRequestId.current;
    dispatchFlow({ type: "start", requestId, destination: "leader" });
    if (escalation.current?.question !== question || escalation.current?.meetingId !== meetingId) escalation.current = { question, meetingId, id: key(), pending: false };
    const attempt = escalation.current!;
    attempt.pending = true; setSending(true);
    try { const r = await zone<{ ticket: Ticket }>("ticket_create", { question, meeting_id: meetingId || undefined, confirmed: true, idempotency_key: attempt.id });
      setSent(r.data.ticket ? `Sent to the leader as ${r.data.ticket.id}. I won't guess; you'll see the answer here.` : r.data.error ?? "not sent");
      dispatchFlow({ type: "finish", requestId, success: Boolean(r.data.ticket) });
    } catch { setError("Question could not be sent. Try again."); dispatchFlow({ type: "finish", requestId, success: false }); }
    finally { attempt.pending = false; setSending(false); }
  };
  const navigate = async () => {
    if (!connected || finding || !cq.trim()) return;
    const requestId = ++flowRequestId.current;
    dispatchFlow({ type: "start", requestId, destination: "code" });
    setFinding(true); setError(""); setGa(null);
    try { const r = await zone<GA>("code_graph_query", { question: cq });
      if (r.status !== 200 || !r.data.graph || !r.data.subgraph) throw new Error(r.data.error ?? "Code graph unavailable");
      setGa(r.data);
      setSourceRefresh(n => n + 1);
      dispatchFlow({ type: "finish", requestId, success: true });
    } catch (e) { setError((e as Error).message); dispatchFlow({ type: "finish", requestId, success: false }); }
    finally { setFinding(false); }
  };

  const zoneIndex = focus === "team_memory" ? 0 : focus === "leader_desk" ? 1 : 2;
  return (
    <main className={`${s.page} ${s.teamPage}`} data-expanded={expanded} data-focus={focus}>
      <div className={s.workspaceShell}>
      <header className={s.top}>
        <a href="/" className={s.title}><span className={s.mark} aria-hidden="true" />Kaam Ki Baat <span className={s.workspaceName}>Workspace</span></a>
        <div className={s.topRight}>
          {me?.snapshot && <span className={s.meta}><span className={s.badge}>{me.snapshot.label}</span>{me.snapshot.repository} @ {me.snapshot.pinnedSha.slice(0, 7)}</span>}
          <span className={s.connection} role="status"><span className={connected ? s.ok : connecting ? s.warn : s.bad}>●</span>{connecting ? "Connecting" : connected ? "Connected" : "Offline"}</span>
          <a href="/" className={s.btn}>Back to site</a>
        </div>
      </header>
      <section className={s.welcome} aria-labelledby="workspace-heading">
        <div>
          <h1 id="workspace-heading">Your project, in context.</h1>
          <p>Connect your repository, pick an agent, and ask. Answers come with their source.</p>
        </div>
        {!connected && !connecting && <button className={`${s.btn} ${s.primary}`} onClick={() => void refreshSession()}>Retry connection</button>}
      </section>
      <FlowRail stage={flow.stage} busy={flow.busy} branch={flow.branch} />
      <div className={s.layout}>
      <aside className={s.side} aria-label="Project and controls">
        {connected ? <ProjectConnection selectedZone={focus} repository={me!.snapshot?.repository ?? "harshsinha-12/kaam-ki-baat"} onConnected={connectProject} />
          : <section className={s.repoPanel}><div className={s.label}>Project connection</div><p className={s.meta}>{connecting ? "Connecting your workspace session…" : "Connect the workspace to choose a repository."}</p></section>}
        {connected && <FocusInputControls compact key={me!.participant!.name} onConfirmedFocus={followFocus} />}
      </aside>
      <div className={s.mainCol}>
      <div className={s.workspaceHeading}><div><span className={s.label}>Agents</span><h2>Three perspectives. One conversation.</h2></div><button className={s.textButton} aria-pressed={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? "Show controls" : "Focus mode"}</button></div>
      <div className={s.zones} role="group" aria-label="Agents" style={{ "--idx": zoneIndex } as CSSProperties}>
        <span className={s.zoneIndicator} aria-hidden="true" />
        <button data-zone="team_memory" className={`${s.zbtn} ${focus === "team_memory" ? s.zbtnOn : ""}`} disabled={!connected} aria-pressed={focus === "team_memory"} onClick={() => void selectSpace("team_memory")}><AgentGlyph zone="team_memory" size={28} /><span><strong>Team Memory</strong><small>What the team decided</small></span><span className={s.zoneKey} aria-hidden="true">←</span></button>
        <button data-zone="leader_desk" className={`${s.zbtn} ${s.lock} ${focus === "leader_desk" ? s.centerSelected : ""}`} disabled={!connected} aria-pressed={focus === "leader_desk"} onClick={() => void selectSpace("leader_desk")} title={me?.zones?.leader_desk?.reason ?? "Leader access requires a verified leader session"}><AgentGlyph zone="leader_desk" size={28} /><span><strong>Leader Desk</strong><small>Lead only</small></span><span className={s.zoneKey} aria-hidden="true">↑</span></button>
        <button data-zone="code_navigator" className={`${s.zbtn} ${focus === "code_navigator" ? s.zbtnOn : ""}`} disabled={!connected} aria-pressed={focus === "code_navigator"} onClick={() => void selectSpace("code_navigator")}><AgentGlyph zone="code_navigator" size={28} /><span><strong>Code Navigator</strong><small>Find it in the code</small></span><span className={s.zoneKey} aria-hidden="true">→</span></button>
      </div>
      {error && <p className={s.bad} role="alert">{error}</p>}

      {focus === "leader_desk" && <section className={`${s.card} ${s.activeC} ${s.leaderHint}`} role="status"><div><div className={s.label}>Leader Desk</div><h2>Questions the notes could not answer go here.</h2><p>Charan is the team lead. The desk opens only for a verified lead session with a passkey. Teammates can still ask Team Memory below, and answers arrive there.</p></div><a className={`${s.btn} ${s.primary}`} href="/leader">Open Leader Desk</a></section>}
      <div className={s.grid}>
        <section data-zone="team_memory" className={`${s.card} ${focus === "team_memory" ? s.active : ""}`}>
          <div className={s.cardHeading}><span className={s.zoneNumber}><AgentGlyph zone="team_memory" size={18} />Team Memory</span><span className={s.cardTag}>Approved meeting notes</span></div>
          <h2 className={s.h}>What did we decide?</h2>
          <p className={s.cardDescription}>Pick up where your team left off.</p>
          {connected && <div className={s.list}>
            <label className={s.label} htmlFor="memory-meeting">Wispr meeting sources</label>
            {meetings.length > 0 ? <>
              <select id="memory-meeting" className={s.input} value={meetingId} disabled={asking || sending} onChange={e => { setMeetingId(e.target.value); setMem(null); setSent(null); }}>
                <option value="">All permitted meetings ({meetings.length})</option>
                {meetings.map(m => <option key={m.id} value={m.id}>{m.title} · {m.source === "FIXTURE" ? "demo · " : ""}{m.passageCount} passages</option>)}
              </select>
              {meetings.filter(m => !meetingId || m.id === meetingId).map(m => <div key={m.id} className={s.meta}>
                {m.shareLink ? <a href={m.shareLink} target="_blank" rel="noreferrer">{m.title} ↗</a> : m.title}
                {` · ${m.source === "FIXTURE" ? "Demo source" : "Imported from Wispr"} · ${m.passageCount} permitted passages`}
                {m.fetchedAt && ` · read ${new Date(m.fetchedAt).toLocaleString()}`}
              </div>)}
            </> : <p className={s.meta}>No approved Wispr meetings are available to your session. Ask your team lead to import a selected meeting and grant access.</p>}
          </div>}
          <div className={s.row}>
            <input className={s.input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask()} aria-label="Ask Team Memory" />
            <button className={`${s.btn} ${s.primary}`} disabled={!connected || asking || !q.trim()} onClick={ask}>{asking ? "Looking up…" : "Ask"}</button>
          </div>
          {!mem && <div className={s.empty}><span className={s.label}>{asking ? "Reading permitted sources" : "Ask about the meeting"}</span><p>{asking ? "Checking your team’s approved notes…" : "Ask about a decision, commitment, or owner. If the notes do not confirm an answer, you can ask your leader."}</p></div>}
          {mem && (
            <div className={s.answer}>
              <div className={s.state} data-kind={mem.kind === "confirmed" ? "ok" : ["conditional", "meeting_context"].includes(mem.kind) ? "wait" : "bad"}>{mem.kind.replaceAll("_", " ").replace(/^./, c => c.toUpperCase())}</div>
              <div style={{ marginTop: 6 }}>{mem.speak}</div>
              <div className={s.src}>{mem.sources.map((x, i) => <span key={i}>{x.kind} · {x.url ? <a href={x.url} target="_blank" rel="noreferrer">{x.label} ↗</a> : x.label}</span>)}{mem.provisional.map((p, i) => <span key={`p${i}`} className={s.warn}>live (provisional) · {p.text}</span>)}</div>
              {mem.offerEscalation && !mem.pendingTicket && !sent && <button className={s.btn} style={{ marginTop: 12 }} disabled={sending} onClick={escalate}>{sending ? "Sending…" : "Yes, ask the leader"}</button>}
              {sent && <p className={s.meta} style={{ marginTop: 10 }}>{sent}</p>}
            </div>
          )}
          <div className={s.list}>
            {inbox.answered.map((t) => (
              <div key={t.id} className={s.item}>
                <div className={s.state} data-kind="ok">Lead answered · version {t.answer?.decisionVersion}</div>
                <div>“{t.question}” → <b>{t.answer?.statement}</b>{t.answer?.conditions ? `, on condition that ${t.answer.conditions}` : ""}</div>
                {t.state !== "acknowledged" && <button className={s.btn} style={{ marginTop: 8 }} onClick={() => { void zone("delivery_ack", { ticket_id: t.id }).then(r => { if (r.status !== 200) setError(r.data.error ?? "Acknowledgement failed"); }).catch(() => setError("Acknowledgement failed. Try again.")); }}>Got it</button>}
              </div>
            ))}
            {inbox.pending.map((t) => <div key={t.id} className={s.item}><span className={s.state} data-kind="wait">Waiting for the lead</span> {t.question}</div>)}
          </div>
        </section>

        <section data-zone="code_navigator" id="code-navigator" className={`${s.card} ${focus === "code_navigator" ? s.activeR : ""}`}>
          <div className={s.cardHeading}><span className={s.zoneNumber}><AgentGlyph zone="code_navigator" size={18} />Code Navigator</span><span className={s.cardTag}>Pinned to a commit</span></div>
          <h2 className={s.h}>Where is it in the code?</h2>
          <p className={s.cardDescription}>Trace an idea to the exact implementation.</p>
          <div className={s.row}>
            <input className={s.input} value={cq} onChange={(e) => setCq(e.target.value)} onKeyDown={(e) => e.key === "Enter" && navigate()} aria-label="Ask Code Navigator" />
            <button className={`${s.btn} ${s.primary}`} disabled={!connected || finding || !cq.trim()} onClick={navigate}>{finding ? "Finding…" : "Find"}</button>
          </div>
          {ga ? <CodeGraphView graph={ga.graph} highlight={ga.subgraph.nodes} height={360} onPick={openGraphSource} /> : <div className={s.empty}><span className={s.label}>{finding ? "Searching pinned code" : "Ask about the code"}</span><p>{finding ? "Finding relevant files and connections…" : "Ask where a behavior is implemented. Results link to a file and line at the selected commit. Graph connections are hints to verify in the source."}</p></div>}
          {ga && (
            <>
              {ga.seed && <a className={s.meta} href={`https://github.com/${ga.repository}/blob/${ga.sha}/${ga.seed.path}#L${ga.seed.line}`} target="_blank" rel="noreferrer">{ga.seed.path}:{ga.seed.line} @ {ga.sha.slice(0, 7)} ↗ <span className={s.state} data-kind={ga.match === "confirmed" ? "ok" : "wait"}>{ga.match === "confirmed" ? "Confirmed" : "Candidate"}</span></a>}
              <a className={s.meta} href={`/graph?q=${encodeURIComponent(cq)}`}>See how it was found in the full graph</a>
              <ol className={s.steps}>{ga.explanation.map((l, i) => <li key={i}>{l.replace(/^\d+\.\s*/, "")}</li>)}</ol>
            </>
          )}
          {connected && <CodeFocus request={sourceRequest} refreshKey={sourceRefresh} onFocus={highlightSource} />}
        </section>
      </div>
      </div>
      </div>
      <footer className={s.workspaceFooter}><span>Kaam Ki Baat</span><span>Grounded in your meetings. Connected to your code. Use ← ↑ → to switch agents.</span></footer>
      </div>
    </main>
  );
}
