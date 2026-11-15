import { mkdir, readFile, writeFile, rename, open } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { EventStore, eventsLogPath } from "../store/event-store";
import { evaluateCall, obj, hash, type EvaluationDashboard, type Obj } from "./dashboard";

export const dashboardDir = () => path.resolve(process.env.KKB_EVAL_DIR?.trim() || "data/private/call-evals");
export async function readDashboard(): Promise<EvaluationDashboard | null> {
  try { const data = JSON.parse(await readFile(path.join(dashboardDir(), "latest.json"), "utf8"));
    if (data.schema !== 1 || !Array.isArray(data.calls)) throw new Error("Invalid evaluation store"); return data;
  } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return null; throw e; }
}
async function persist(data: EvaluationDashboard) {
  const dir = dashboardDir(); await mkdir(path.join(dir, "runs"), { recursive: true, mode: 0o700 });
  const text = JSON.stringify(data, null, 2), digest = hash(data.calls.map(c => c.inputHash));
  const run = path.join(dir, "runs", `${digest}.json`);
  try { await writeFile(run, text, { mode: 0o600, flag: "wx" }); }
  catch (e) { if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e; }
  const saved = JSON.parse(await readFile(run, "utf8")) as EvaluationDashboard;
  if (hash(saved.calls.map(c => c.inputHash)) !== digest) throw new Error("Evaluation read-back mismatch");
  const tmp = path.join(dir, `.latest-${randomUUID()}.json`);
  const fh = await open(tmp, "wx", 0o600);
  try { await fh.writeFile(text); await fh.sync(); } finally { await fh.close(); }
  await rename(tmp, path.join(dir, "latest.json"));
  const fresh = await readDashboard();
  if (fresh?.syncedAt !== data.syncedAt || hash(fresh.calls) !== hash(data.calls)) throw new Error("Evaluation read-back mismatch");
}

let inFlight: Promise<EvaluationDashboard> | null = null;
export function syncDashboard(): Promise<EvaluationDashboard> {
  if (inFlight) return inFlight;
  inFlight = synchronize().finally(() => { inFlight = null; }); return inFlight;
}
async function synchronize(): Promise<EvaluationDashboard> {
  const agentId = process.env.BOLNA_AGENT_ID, key = process.env.BOLNA_API_KEY;
  if (!agentId || !/^[a-f0-9-]{36}$/i.test(agentId) || !key) throw new Error("Bolna evaluation configuration unavailable");
  const previous = await readDashboard();
  if (previous && previous.agentId !== agentId) throw new Error("Evaluation store belongs to a different agent");
  if (previous && Date.now() - Date.parse(previous.syncedAt) < 60000) return previous;
  async function get(endpoint: string): Promise<Obj> {
    const response = await fetch(`https://api.bolna.ai${endpoint}`, { headers: { Authorization: `Bearer ${key}` }, cache: "no-store", signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`Bolna read failed (${response.status})`);
    return obj(await response.json());
  }
  // Initial backfill begins at this project's first call day; later runs overlap
  // the prior successful sync. Seven-day windows obey Bolna's range limit.
  const since = Date.parse(process.env.KKB_EVAL_SINCE?.trim() || "2026-11-15T00:00:00.000Z");
  if (!Number.isFinite(since)) throw new Error("Invalid evaluation start date");
  const end = Date.now(), start = previous ? Math.max(since, Date.parse(previous.syncedAt) - 86400000) : since;
  const listed = new Map<string, Obj>();
  for (let from = start, windows = 0; from <= end; from += 7 * 86400000) {
    if (++windows > 100) throw new Error("Evaluation backfill too large; narrow KKB_EVAL_SINCE");
    const to = Math.min(end, from + 7 * 86400000);
    for (let page = 1; ; page++) {
      if (page > 100) throw new Error("Incomplete Bolna pagination");
      const query = new URLSearchParams({ page_number: String(page), page_size: "50", from: new Date(from).toISOString(), to: new Date(to).toISOString() });
      const result = await get(`/v2/agent/${agentId}/executions?${query}`);
      if (!Array.isArray(result.data)) throw new Error("Unexpected Bolna execution list");
      for (const item of result.data) { const raw = obj(item); if (typeof raw.id !== "string" || !/^[a-f0-9-]{36}$/i.test(raw.id) || raw.agent_id !== agentId) throw new Error("Execution agent mismatch"); listed.set(raw.id, raw); }
      if (result.has_more === false) break;
      if (result.has_more !== true || !result.data.length) throw new Error("Incomplete Bolna pagination");
    }
  }
  const calls = new Map((previous?.calls ?? []).map(c => [c.id, c]));
  let reviews: Obj = {};
  try { reviews = obj(JSON.parse(await readFile(path.join(dashboardDir(), "reviews.json"), "utf8"))); }
  catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
  let events = null;
  const warnings: string[] = [];
  try { events = await new EventStore(eventsLogPath()).all(); } catch { warnings.push("Configured local audit could not be read; local evidence is inconclusive."); }
  const entries = [...listed];
  // Bounded parallel reads; each refresh rechecks post-processing and missing logs.
  for (let i = 0; i < entries.length; i += 3) await Promise.all(entries.slice(i, i + 3).map(async ([id, raw]) => {
    let debug: Obj = {};
    try { debug = await get(`/executions/${id}/debug`); if (debug.execution_id !== id) throw new Error("Debug execution mismatch"); }
    catch { warnings.push(`Debug data unavailable for ${id}; retry on next refresh.`); }
    if (Object.keys(debug).length && obj(debug.execution).agent_id !== agentId) throw new Error("Debug agent mismatch");
    let review = "";
    try { review = await readFile(path.join(process.cwd(), "docs/evals", `${id}.md`), "utf8"); } catch { /* no authored review yet */ }
    const extraReview = reviews[id];
    if (typeof extraReview === "string") review += `\n\n${extraReview}`;
    else if (Array.isArray(extraReview) && extraReview.every(v => typeof v === "string")) review += `\n\n${extraReview.join("\n\n")}`;
    const evaluation = evaluateCall(raw, debug, events, review, [key, process.env.KKB_TOOL_KEY ?? "", process.env.KKB_BOARD_KEY ?? "", process.env.KKB_CALLBACK_KEY ?? ""]);
    calls.set(id, evaluation);
    if (Array.isArray(debug.unavailable) && debug.unavailable.length) warnings.push(`Provider reports unavailable debug sections for ${id}.`);
  }));
  const data: EvaluationDashboard = { schema: 1, agentId, syncedAt: new Date().toISOString(), calls: [...calls.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), warnings };
  await persist(data); return data;
}
