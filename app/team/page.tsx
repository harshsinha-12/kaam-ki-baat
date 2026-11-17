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
import w from "./workspace.module.css";
import { BrandMark } from "../components/BrandMark";
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
    let alive = true, inFlight = false;
    const poll = () => {
      if (!alive || document.hidden || inFlight) return;
      inFlight = true;
      void zone<{ answered: Ticket[]; pending: Ticket[] }>("deliveries").then((r) => {
        if (!alive) return;
        if (r.status === 200 && r.data.answered) { setInbox({ answered: r.data.answered, pending: r.data.pending }); setError(previous => previous === "Answers could not refresh. Retrying…" ? "" : previous); }
      }).catch(() => { if (alive) setError("Answers could not refresh. Retrying…"); }).finally(() => { inFlight = false; });
    };
    poll(); const id = setInterval(poll, 3000); return () => { alive = false; clearInterval(id); };
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
  const status = connecting ? "connecting" : connected ? "online" : "offline";
  const MEMORY_IDEAS = ["What did we agree in the meeting?", "Code freeze kab hai?", "Who owns the CI fix?"];
  const CODE_IDEAS = ["where do we read back before saying saved", "woh timeout wala code kahan hai?", "which test covers persistVerifiedUpdate"];
  const ZONES_UI = [
    { z: "team_memory" as const, t: "Team Memory", d: "What the team decided", k: "←" },
    { z: "leader_desk" as const, t: "Leader Desk", d: "Lead only", k: "↑" },
    { z: "code_navigator" as const, t: "Code Navigator", d: "Find it in the code", k: "→" },
  ];
  return (
    <main className={w.page} data-expanded={expanded} data-focus={focus}>
      <header className={w.top}>
        <div className={w.topInner}>
          <a href="/" className={w.brand} aria-label="Kaam Ki Baat home"><BrandMark size={30} track /><span>Kaam Ki Baat</span></a>
          <span className={w.crumb} aria-hidden>/</span>
          <span className={w.crumbNow}>Workspace</span>
          <div className={w.topRight}>
            {me?.snapshot && <span className={w.snap} title={`${me.snapshot.repository} @ ${me.snapshot.pinnedSha}`}><span className={w.snapLabel}>{me.snapshot.label}</span><span className={w.mono}>{me.snapshot.repository}</span><span className={w.sha}>{me.snapshot.pinnedSha.slice(0, 7)}</span></span>}
            {me?.participant && <span className={w.who}><span className={w.avatar}>{me.participant.name.slice(0, 1)}</span>{me.participant.name}</span>}
            <span className={w.status} data-status={status} role="status"><i />{connecting ? "Connecting" : connected ? "Connected" : "Offline"}</span>
            <a href="/" className={`${w.btn} ${w.ghost}`}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 6l-6 6 6 6" /></svg>Back to site</a>
          </div>
        </div>
      </header>

      <div className={w.shell}>
        <section className={w.intro} aria-labelledby="workspace-heading">
          <div className={w.introCopy}>
            <h1 id="workspace-heading">Your project, in context.</h1>
            <p>Ask a question. Watch it travel through your meeting notes, the lead, and the code. Every answer shows its source.</p>
          </div>
          <FlowRail stage={flow.stage} busy={flow.busy} branch={flow.branch} />
        </section>

        {!connected && !connecting && (
          <div className={w.offline} role="alert">
            <span className={w.offlineIcon} aria-hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M2 8.5a15 15 0 0 1 20 0M5.5 12a10 10 0 0 1 9-2.6M9 15.5a5 5 0 0 1 4.5-1M3 3l18 18" /><circle cx="12" cy="19" r="1.2" fill="currentColor" /></svg></span>
            <div><strong>The workspace could not connect.</strong><span>{error && error !== "The workspace could not connect. Check the connection and try again." ? error : "Your session did not reach the server. Check your connection, then try again. Nothing you typed is lost."}</span></div>
            <button className={`${w.btn} ${w.primary}`} onClick={() => void refreshSession()}>Retry connection</button>
          </div>
        )}

        <div className={w.switchRow}>
          <div className={w.zones} role="group" aria-label="Agents" style={{ "--idx": zoneIndex } as CSSProperties}>
            <span className={w.zoneIndicator} aria-hidden="true" />
            {ZONES_UI.map((zu) => (
              <button key={zu.z} data-zone={zu.z} className={w.zbtn} data-on={focus === zu.z} disabled={!connected} aria-pressed={focus === zu.z}
                onClick={() => void selectSpace(zu.z)} title={zu.z === "leader_desk" ? (me?.zones?.leader_desk?.reason ?? "Leader access requires a verified leader session") : undefined}>
                <AgentGlyph zone={zu.z} size={26} active={focus === zu.z} />
                <span><strong>{zu.t}</strong><small>{zu.d}</small></span>
                <kbd className={w.kbd} aria-hidden="true">{zu.k}</kbd>
              </button>
            ))}
          </div>
          <button className={`${w.btn} ${w.ghost}`} aria-pressed={expanded} onClick={() => setExpanded(value => !value)}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>{expanded ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /> : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}</svg>
            {expanded ? "Show controls" : "Focus mode"}
          </button>
        </div>
        {error && connected && <p className={w.error} role="alert">{error}</p>}

        <div className={w.layout}>
          {/* LEFT: Team Memory */}
          <section data-zone="team_memory" className={w.card} data-active={focus === "team_memory"}>
            <div className={w.cardHead}>
              <span className={w.cardWho}><AgentGlyph zone="team_memory" size={22} />Team Memory</span>
              <span className={w.tag}>Approved meeting notes</span>
            </div>
            <h2 className={w.h}>What did we decide?</h2>
            <p className={w.cardSub}>Pick up where your team left off. Answers cite the meeting line.</p>
            <div className={w.ask}>
              <input className={w.input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask()} aria-label="Ask Team Memory" placeholder="Ask about a decision, owner or deadline" />
              <button className={`${w.btn} ${w.primary}`} disabled={!connected || asking || !q.trim()} onClick={ask}>{asking ? "Looking up…" : "Ask"}</button>
            </div>
            <div className={w.ideas} aria-label="Example questions">{MEMORY_IDEAS.map(x => <button key={x} type="button" className={w.idea} data-on={q === x} onClick={() => setQ(x)}>{x}</button>)}</div>
            {connected && (
              <div className={w.sourceBox}>
                <label className={w.label} htmlFor="memory-meeting">Meeting source</label>
                {meetings.length > 0 ? <>
                  <select id="memory-meeting" className={w.input} value={meetingId} disabled={asking || sending} onChange={e => { setMeetingId(e.target.value); setMem(null); setSent(null); }}>
                    <option value="">All permitted meetings ({meetings.length})</option>
                    {meetings.map(m => <option key={m.id} value={m.id}>{m.title} · {m.source === "FIXTURE" ? "demo · " : ""}{m.passageCount} passages</option>)}
                  </select>
                  {meetings.filter(m => !meetingId || m.id === meetingId).map(m => <div key={m.id} className={w.meetRow}>
                    <span className={w.wisprTile} aria-hidden>{/* eslint-disable-next-line @next/next/no-img-element */}<img src="/brand/wispr-flow.png" alt="" /></span>
                    <span><b>{m.shareLink ? <a href={m.shareLink} target="_blank" rel="noreferrer">{m.title}</a> : m.title}</b>
                    <small>{m.source === "FIXTURE" ? "Demo source" : "Imported from Wispr"} · {m.passageCount} permitted passages{m.fetchedAt ? ` · read ${new Date(m.fetchedAt).toLocaleString()}` : ""}</small></span>
                  </div>)}
                </> : <p className={w.note}>No approved Wispr meetings are available to your session. Ask your team lead to import a meeting and grant access.</p>}
              </div>
            )}
            {!mem && (
              <div className={w.empty} data-busy={asking}>
                <div className={w.emptyArt} aria-hidden>
                  <span className={w.bubbleYou}>{q || "What did we decide?"}</span>
                  <span className={w.bubbleAgent}><i /><i /><i /></span>
                </div>
                <p>{asking ? "Reading your team’s approved notes…" : connected ? "Ask about a decision, commitment or owner. If the notes don’t confirm it, you can send it to the lead." : "Connect the workspace to ask. Answers come only from approved meeting notes."}</p>
              </div>
            )}
            {mem && (
              <div className={w.answer}>
                <div className={w.state} data-kind={mem.kind === "confirmed" ? "ok" : ["conditional", "meeting_context"].includes(mem.kind) ? "wait" : "bad"}>{mem.kind.replaceAll("_", " ").replace(/^./, c => c.toUpperCase())}</div>
                <p className={w.answerText}>{mem.speak}</p>
                <div className={w.src}>{mem.sources.map((x, i) => <span key={i}><b>{x.kind}</b>{x.url ? <a href={x.url} target="_blank" rel="noreferrer">{x.label}</a> : x.label}</span>)}{mem.provisional.map((p, i) => <span key={`p${i}`} className={w.warn}><b>live, provisional</b>{p.text}</span>)}</div>
                {mem.offerEscalation && !mem.pendingTicket && !sent && <button className={w.btn} disabled={sending} onClick={escalate}><AgentGlyph zone="leader_desk" size={18} />{sending ? "Sending…" : "Yes, ask the lead"}</button>}
                {sent && <p className={w.note}>{sent}</p>}
              </div>
            )}
            {(inbox.answered.length > 0 || inbox.pending.length > 0) && <div className={w.inbox}>
              <div className={w.label}>From the lead</div>
              {inbox.answered.map((t) => (
                <div key={t.id} className={w.item}>
                  <div className={w.state} data-kind="ok">Lead answered · version {t.answer?.decisionVersion}</div>
                  <div>“{t.question}” <b>{t.answer?.statement}</b>{t.answer?.conditions ? `, on condition that ${t.answer.conditions}` : ""}</div>
                  {t.state !== "acknowledged" && <button className={`${w.btn} ${w.small}`} onClick={() => { void zone("delivery_ack", { ticket_id: t.id }).then(r => { if (r.status !== 200) setError(r.data.error ?? "Acknowledgement failed"); }).catch(() => setError("Acknowledgement failed. Try again.")); }}>Got it</button>}
                </div>
              ))}
              {inbox.pending.map((t) => <div key={t.id} className={w.item}><span className={w.state} data-kind="wait">Waiting for the lead</span> {t.question}</div>)}
            </div>}
          </section>

          {/* CENTRE: you, the project and the lead */}
          <aside className={w.center} aria-label="Project, voice and the lead">
            {connected ? <ProjectConnection selectedZone={focus} repository={me!.snapshot?.repository ?? "harshsinha-12/kaam-ki-baat"} onConnected={connectProject} />
              : <section className={w.panel} aria-label="Getting ready">
                  <div className={w.panelHead}><span className={w.panelIcon} aria-hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M6 3v12M18 9v12M6 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM18 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM6 15c0-4 12-2 12-6" /></svg></span><div><h2>Project connection</h2><p>Three steps before your first answer.</p></div></div>
                  <ol className={w.checklist}>
                    <li data-state={connecting ? "now" : "todo"}><i />{connecting ? "Connecting your session…" : "Connect your session"}<small>A signed link from your team lead</small></li>
                    <li data-state="todo"><i />Choose the approved repository<small>Pinned to one commit, read only</small></li>
                    <li data-state="todo"><i />Start voice, if you want<small>Bolna call, with your consent</small></li>
                  </ol>
                  <div className={w.ghostInput} aria-hidden><span>https://github.com/owner/repository</span><span className={w.ghostBtn}>Connect</span></div>
                </section>}
            <section className={w.leadCard} data-active={focus === "leader_desk"}>
              <div className={w.cardHead}><span className={w.cardWho}><AgentGlyph zone="leader_desk" size={22} />Leader Desk</span><span className={w.lockTag}><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>Lead only</span></div>
              <p>Questions the notes can’t answer go to the lead. The desk opens only for a verified lead with a passkey. Answers come back to Team Memory.</p>
              <div className={w.leadStats}>
                <span><b>{inbox.pending.length}</b>waiting</span>
                <span><b>{inbox.answered.length}</b>answered</span>
              </div>
              {focus === "leader_desk" && <a className={`${w.btn} ${w.primary} ${w.full}`} href="/leader">Open Leader Desk</a>}
            </section>
            {connected && <div className={w.focusBox}><FocusInputControls compact key={me!.participant!.name} onConfirmedFocus={followFocus} /></div>}
          </aside>

          {/* RIGHT: Code Navigator */}
          <section data-zone="code_navigator" id="code-navigator" className={w.card} data-active={focus === "code_navigator"}>
            <div className={w.cardHead}>
              <span className={w.cardWho}><AgentGlyph zone="code_navigator" size={22} />Code Navigator</span>
              <span className={w.tag}>Pinned to a commit</span>
            </div>
            <h2 className={w.h}>Where is it in the code?</h2>
            <p className={w.cardSub}>Trace an idea to the file, function, line and test.</p>
            <div className={w.ask}>
              <input className={w.input} value={cq} onChange={(e) => setCq(e.target.value)} onKeyDown={(e) => e.key === "Enter" && navigate()} aria-label="Ask Code Navigator" placeholder="Describe the behaviour you’re looking for" />
              <button className={`${w.btn} ${w.primary}`} disabled={!connected || finding || !cq.trim()} onClick={navigate}>{finding ? "Finding…" : "Find"}</button>
            </div>
            <div className={w.ideas} aria-label="Example questions">{CODE_IDEAS.map(x => <button key={x} type="button" className={w.idea} data-on={cq === x} onClick={() => setCq(x)}>{x}</button>)}</div>
            {ga ? <div className={w.graphBox}><CodeGraphView graph={ga.graph} highlight={ga.subgraph.nodes} height={360} onPick={openGraphSource} /></div> : (
              <div className={w.empty} data-busy={finding}>
                <svg className={w.graphArt} viewBox="0 0 320 150" aria-hidden>
                  {[[40, 40, 110, 70], [110, 70, 190, 38], [110, 70, 170, 112], [190, 38, 270, 62], [170, 112, 262, 116], [270, 62, 262, 116]].map(([x1, y1, x2, y2], i) => <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} style={{ "--i": i } as CSSProperties} />)}
                  {[[40, 40, "file"], [110, 70, "fn"], [190, 38, "fn"], [170, 112, "test"], [270, 62, "line"], [262, 116, "pr"]].map(([x, y, k], i) => <g key={i} data-k={k} style={{ "--i": i } as CSSProperties}><circle cx={x} cy={y} r={k === "line" ? 7 : 5} /></g>)}
                </svg>
                <p>{finding ? "Finding relevant files and connections…" : connected ? "Ask where a behaviour lives. Results link to a file and line at the pinned commit. Graph links are hints to check in the source." : "Connect the workspace to search the code graph at a pinned commit."}</p>
              </div>
            )}
            {ga && (
              <div className={w.result}>
                {ga.seed && <a className={w.seed} href={`https://github.com/${ga.repository}/blob/${ga.sha}/${ga.seed.path}#L${ga.seed.line}`} target="_blank" rel="noreferrer"><span className={w.mono}>{ga.seed.path}:{ga.seed.line}</span><span className={w.sha}>{ga.sha.slice(0, 7)}</span><span className={w.state} data-kind={ga.match === "confirmed" ? "ok" : "wait"}>{ga.match === "confirmed" ? "Confirmed" : "Candidate"}</span></a>}
                {ga.explanation.length > 0 && <ol className={w.steps}>{ga.explanation.map((l, i) => <li key={i}>{l.replace(/^\d+\.\s*/, "")}</li>)}</ol>}
                <a className={w.link} href={`/graph?q=${encodeURIComponent(cq)}`}>See how it was found in the full graph</a>
              </div>
            )}
            {connected && <CodeFocus request={sourceRequest} refreshKey={sourceRefresh} onFocus={highlightSource} />}
          </section>
        </div>

        <footer className={w.footer}>
          <span className={w.footBrand}><BrandMark size={18} blink={false} />Kaam Ki Baat</span>
          <span>Grounded in your meetings, connected to your code. Use <kbd className={w.kbd}>←</kbd><kbd className={w.kbd}>↑</kbd><kbd className={w.kbd}>→</kbd> to switch agents.</span>
        </footer>
      </div>
    </main>
  );
}
