"use client";
import { useEffect, useState } from "react";
import type { CallEvaluation, EvaluationDashboard, Json } from "@/lib/eval/dashboard";
import s from "./evals.module.css";

type Data = EvaluationDashboard & { stale?: boolean };
const date = (value: string) => new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
function JsonView({ value }: { value: Json }) { return <pre>{typeof value === "string" ? value : JSON.stringify(value, null, 2)}</pre>; }
function Detail({ call }: { call: CallEvaluation }) {
  const [tab, setTab] = useState("Findings");
  return <section className={s.detail}>
    <div className={s.detailHead}><div><span className={s.eyebrow}>{call.channel === "web-call" ? "Browser conversation" : "Phone conversation"}</span><h2>{date(call.createdAt)}</h2><code>{call.id}</code></div><span className={s.duration}>{call.duration ?? "n/a"}<small> seconds</small></span></div>
    <div className={s.meta}><span>{call.status} · {call.termination || "pending ending"}</span><span>Agent version <code>{call.version || "unavailable"}</code></span></div>
    <div className={s.tabs} role="tablist" aria-label="Call evaluation sections">{["Findings", "Transcript", "Tools", "Context", "Pipeline"].map(t => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{t}{t === "Tools" ? ` (${call.tools.length})` : ""}</button>)}</div>
    <div role="tabpanel" className={s.tabBody}>
      {tab === "Findings" && <><div className={s.findings}>{call.findings.map(f => <article key={f.title}><span className={s.verdict} data-verdict={f.verdict}>{f.verdict}</span><div><h3>{f.title}</h3><p>{f.detail}</p></div></article>)}</div><div className={s.note}><h3>Evidence boundaries</h3><p>{call.consent}.</p><p>{call.correlation}.</p><p>These checks evaluate recorded evidence. Speech quality, grounding and organizer eligibility require review. No LLM judge was run.</p></div>{call.review && <details><summary>Previously recorded review and fixes</summary><pre>{call.review}</pre></details>}</>}
      {tab === "Transcript" && <><p className={s.hint}>Provider transcript. Segments marked buffered / not delivered may be combined into later turns; audio accuracy is unverified.</p>{Array.isArray(call.transcript) ? call.transcript.filter(v => v && typeof v === "object" && !Array.isArray(v) && v.kind === "message").map((v, i) => { const t = v as Record<string, Json>; return <article key={i} className={s.utterance} data-role={t.role}><span>{String(t.role)} {t.not_sent_to_agent === true && <small>· buffered / not delivered</small>}</span><p>{String(t.text ?? "")}</p></article>; }) : <JsonView value={call.transcript} />}</>}
      {tab === "Tools" && <><p className={s.hint}>Actual function calls in provider progression. Configured tools and setup preflights are counted separately.</p>{call.tools.length === 0 && <p>No function calls available in provider progression.</p>}{call.tools.map((t, i) => <article className={s.tool} key={i}><h3><code>{t.name}</code><span className={s.verdict} data-verdict={t.code === null ? "inconclusive" : t.code < 400 ? "pass" : "fail"}>{t.code ?? "unknown"}</span></h3><p>{t.latencyMs ?? "n/a"} ms · {t.status} · {t.at && date(t.at)}</p><details><summary>Arguments and returned evidence</summary><h4>Request</h4><JsonView value={t.request} /><h4>Response</h4><JsonView value={t.response} /></details></article>)}<details><summary>Local audit tools (may include setup; excluded from provider counts)</summary><JsonView value={call.auditTools} /></details></>}
      {tab === "Context" && <><h3>Captured call context</h3><p className={s.hint}>Context supplied for this execution, including source SHA and passages when available. This is historical context; it may differ from today's repository.</p><JsonView value={call.context} /><h3>Call-time model and speech settings</h3><JsonView value={call.settings} /></>}
      {tab === "Pipeline" && <><h3>Provider latency and interruption metrics</h3><p className={s.hint}>Provider-reported values retain their source units and are not independently measured.</p><JsonView value={call.latency} /><details><summary>Speech, function and error logs</summary><JsonView value={call.logs} /></details><p className={s.hint}>Credentials, phone numbers, recording URLs and raw LLM requests are excluded.</p></>}
    </div><footer className={s.provenance}>Input SHA256 <code>{call.inputHash}</code> · evaluated {date(call.reviewedAt)}</footer>
  </section>;
}

export default function Evals() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState(""), [selected, setSelected] = useState(""), [loading, setLoading] = useState(true), [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true, busy = false;
    const refresh = async () => {
      if (busy) return; busy = true; if (alive) setLoading(true);
      try { const r = await fetch("/api/evals", { cache: "no-store", signal: AbortSignal.timeout(120000) }); const j = await r.json(); if (!r.ok) throw new Error(j.error || "Evaluations unavailable"); if (alive) { setData(j); setError(""); } }
      catch (e) { if (alive) setError(e instanceof Error ? e.message : "Refresh failed"); }
      finally { busy = false; if (alive) setLoading(false); }
    };
    void refresh(); const timer = setInterval(() => { if (!document.hidden) void refresh(); }, 30000);
    return () => { alive = false; clearInterval(timer); };
  }, [tick]);
  const calls = data?.calls ?? [], current = calls.find(c => c.id === selected) ?? calls[0];
  const completed = calls.filter(c => c.status === "completed"), phone = completed.filter(c => c.channel !== "web-call" && c.duration !== null && c.duration > 45);
  return <main className={s.page}><nav><a href="/">Kaam Ki Baat</a><div><a href="/team">Workspace ↗</a><span>Call evaluations</span></div></nav>
    <header className={s.hero}><div><span className={s.eyebrow}>Observe · evaluate · improve</span><h1>Every call.<br /><em>The whole picture.</em></h1><p>Conversations, context and tools, with the evidence behind each result.</p></div><div className={s.refresh}><span className={s.live} data-stale={data?.stale}>{data?.stale ? "Saved snapshot" : data ? "Bolna connected" : loading ? "Loading calls…" : "Calls unavailable"}</span>{data && <small>Updated {date(data.syncedAt)} IST<br />Refreshes every 30s · provider sync at most once/minute</small>}<button disabled={loading} onClick={() => setTick(t => t + 1)}>{loading ? "Refreshing…" : "Refresh calls ↻"}</button></div></header>
    {error && <p role="alert" className={s.error}>{error}</p>}{data?.warnings.map(w => <p key={w} className={s.warning}>{w}</p>)}
    {data && <><section className={s.stats} aria-label="Call summary">{[[calls.length, "Total attempts"], [completed.length, "Completed conversations"], [phone.length, "Phone calls over 45s"], [calls.reduce((n, c) => n + c.tools.length, 0), "Recorded tool calls"]].map(([n, label]) => <article key={label}><strong>{n}</strong><span>{label}</span></article>)}</section><section className={s.chart} aria-label="Call duration chart"><h2>Call history <span>Seconds · the duration gate is 45s</span></h2><div>{[...calls].reverse().map((c, i) => <button key={c.id} onClick={() => setSelected(c.id)} aria-label={`Select call ${i + 1}, ${c.duration ?? "unknown"} seconds`}><span>C{i + 1}</span><div><i style={{ width: `${Math.max(1, (c.duration ?? 0) / Math.max(180, ...calls.map(x => x.duration ?? 0)) * 100)}%` }} data-failed={c.status !== "completed" || c.termination === "agent_voice_error"} /></div><small>{c.duration ?? "n/a"}s</small></button>)}</div></section><div className={s.workspace}><aside><h2>All calls <span>{calls.length}</span></h2>{calls.map(c => <button key={c.id} aria-pressed={current?.id === c.id} onClick={() => setSelected(c.id)}><div><strong>{c.channel === "web-call" ? "Browser" : "Phone"}</strong><span>{c.duration ?? "n/a"}s</span></div><time>{date(c.createdAt)}</time><small>{c.status} · {c.tools.length} tools</small></button>)}</aside>{current ? <Detail key={current.id} call={current} /> : <p>No calls found. New calls appear after the next refresh.</p>}</div></>}
    <footer className={s.footer}>Read-only Bolna API · immutable evaluation history · no calls or agent changes from this page</footer>
  </main>;
}
