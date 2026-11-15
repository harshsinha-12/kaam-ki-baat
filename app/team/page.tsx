"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { CodeGraphView, type ViewGraph } from "../components/CodeGraphView";
import { CodeFocus } from "../components/CodeFocus";
import { key, zone } from "../zones/client";
import s from "../zones/zones.module.css";

// Teammate workspace: LEFT Team Memory (doubts + escalation) and RIGHT Code
// Navigator (graph). CENTER is visible but locked unless the server says otherwise.
// ← / → (or click) selects; selection is sent as a low-privilege focus event.

type Me = { participant?: { name: string }; role?: string; zones?: Record<string, { allowed: boolean; reason?: string }>; snapshot?: { label: string; pinnedSha: string; repository: string }; error?: string };
type Mem = { kind: string; speak: string; offerEscalation: boolean; sources: { kind: string; label: string }[]; question: string; provisional: { text: string }[]; pendingTicket?: { id: string } | null };
type GA = { explanation: string[]; match: string; seed: { label: string; path: string; line: number } | null; subgraph: { nodes: string[] }; graph: ViewGraph; sha: string; repository: string };
type Ticket = { id: string; question: string; state: string; answer?: { statement: string; conditions?: string; approvedBy: string; decisionVersion: number } };

export default function Team() {
  const [me, setMe] = useState<Me | null>(null);
  const [focus, setFocus] = useState<"team_memory" | "code_navigator">("team_memory");
  const seq = useRef(0);
  const [q, setQ] = useState("Who owns the codebase graph agent?");
  const [mem, setMem] = useState<Mem | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const escalation = useRef<{ question: string; id: string; pending: boolean } | null>(null);
  const [sending, setSending] = useState(false);
  const [cq, setCq] = useState("where do we read back before saying saved");
  const [ga, setGa] = useState<GA | null>(null);
  const [error, setError] = useState("");
  const [inbox, setInbox] = useState<{ answered: Ticket[]; pending: Ticket[] }>({ answered: [], pending: [] });

  useEffect(() => { zone<Me>("me").then((r) => setMe(r.data)).catch(() => setError("Cannot connect. Try again.")); }, []);
  const select = useCallback((z: "team_memory" | "code_navigator" | "leader_desk") => {
    seq.current = Math.max(Date.now(), seq.current + 1);
    void zone("focus", { zone: z, provider: "manual", seq: seq.current }).catch(() => setError("Focus could not be saved. Try again."));
    if (z !== "leader_desk") setFocus(z);
  }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      // A / L = select AND activate (explicit keyboard activation, the fallback when no camera or AirPods)
      if (e.key === "a" || e.key === "A") { select("team_memory"); zone("activate", { zone: "team_memory", method: "keyboard" }); }
      if (e.key === "l" || e.key === "L") { select("code_navigator"); zone("activate", { zone: "code_navigator", method: "keyboard" }); }
      if (e.key === "ArrowLeft") select("team_memory");
      if (e.key === "ArrowRight") select("code_navigator");
      if (e.key === "ArrowUp") select("leader_desk");
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [select]);
  // Answers from the leader arrive here, also after a reconnect.
  useEffect(() => {
    const poll = () => zone<{ answered: Ticket[]; pending: Ticket[] }>("deliveries").then((r) => r.status === 200 && r.data.answered && setInbox({ answered: r.data.answered, pending: r.data.pending })).catch(() => setError("Answers could not refresh. Retrying…"));
    poll(); const id = setInterval(poll, 3000); return () => clearInterval(id);
  }, []);

  const ask = async () => {
    setSent(null); setError(""); setMem(null);
    try { const r = await zone<Mem>("memory_ask", { question: q });
      if (r.status !== 200 || !r.data.kind) throw new Error(r.data.error ?? "Memory unavailable");
      setMem(r.data);
    } catch (e) { setError((e as Error).message); }
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
    setError(""); setGa(null);
    try { const r = await zone<GA>("code_graph_query", { question: cq });
      if (r.status !== 200 || !r.data.graph || !r.data.subgraph) throw new Error(r.data.error ?? "Code graph unavailable");
      setGa(r.data);
    } catch (e) { setError((e as Error).message); }
  };

  if (me?.error) return <main className={s.page}><p>Open this page from your personal session link (<code>npm run session:issue</code>). {me.error}</p></main>;

  return (
    <main className={s.page}>
      <div className={s.top}>
        <h1 className={s.title}>Kaam Ki Baat · {me?.participant?.name ?? "…"}</h1>
        <div className={s.meta}>{me?.snapshot && <><span className={s.badge}>{me.snapshot.label}</span> {me.snapshot.repository} @ {me.snapshot.pinnedSha.slice(0, 7)}</>}</div>
      </div>
      {error && <p className={s.bad} role="alert">{error}</p>}
      <div className={s.zones} role="tablist" aria-label="Agents (← ↑ →)">
        <button className={`${s.zbtn} ${focus === "team_memory" ? s.zbtnOn : ""}`} onClick={() => select("team_memory")}><div className={s.label}>← left · press A</div>Team Memory</button>
        <button className={`${s.zbtn} ${s.lock}`} onClick={() => select("leader_desk")} title={me?.zones?.leader_desk?.reason}><div className={s.label}>↑ front · locked</div>Leader Desk</button>
        <button className={`${s.zbtn} ${focus === "code_navigator" ? s.zbtnOn : ""}`} onClick={() => select("code_navigator")}><div className={s.label}>right → · press L</div>Code Navigator</button>
      </div>

      <div className={s.grid}>
        <section className={`${s.card} ${focus === "team_memory" ? s.active : ""}`}>
          <div className={s.label}>Team Memory</div>
          <div className={s.h}>What did we decide?</div>
          <div className={s.row}>
            <input className={s.input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask()} aria-label="Ask Team Memory" />
            <button className={`${s.btn} ${s.primary}`} onClick={ask}>Ask</button>
          </div>
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

        <section className={`${s.card} ${focus === "code_navigator" ? s.activeR : ""}`}>
          <div className={s.label}>Code Navigator · graph of this repo</div>
          <div className={s.h}>Where is it in the code?</div>
          <div className={s.row}>
            <input className={s.input} value={cq} onChange={(e) => setCq(e.target.value)} onKeyDown={(e) => e.key === "Enter" && navigate()} aria-label="Ask Code Navigator" />
            <button className={`${s.btn} ${s.primary}`} onClick={navigate}>Find</button>
          </div>
          {ga ? <CodeGraphView graph={ga.graph} highlight={ga.subgraph.nodes} height={360} /> : <p className={s.meta}>Ask to load the authorized snapshot graph. Static imports and call links are hints; check the pinned source.</p>}
          {ga && (
            <>
              {ga.seed && <a className={s.meta} href={`https://github.com/${ga.repository}/blob/${ga.sha}/${ga.seed.path}#L${ga.seed.line}`} target="_blank" rel="noreferrer">{ga.seed.path}:{ga.seed.line} @ {ga.sha.slice(0, 7)} ↗ · <span className={ga.match === "confirmed" ? s.ok : s.warn}>{ga.match}</span></a>}
              <ol className={s.steps}>{ga.explanation.map((l, i) => <li key={i}>{l.replace(/^\d+\.\s*/, "")}</li>)}</ol>
            </>
          )}
          <CodeFocus />
        </section>
      </div>
    </main>
  );
}
