// npx tsx scripts/eval-call.ts --execution <UUID> --call-id <local call ID>
// Or --input data/private/execution.json (raw get_execution JSON saved privately).
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { executionId, evaluationMarkdown } from "../lib/eval/recorder";
import type { StoredEvent } from "../lib/store/event-store";
const arg = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : undefined; };
async function main() {
  const callId = arg("call-id");
  if (!callId) throw new Error("--call-id required for local audit correlation");
  let raw: Record<string, unknown>;
  if (arg("input")) raw = JSON.parse(await readFile(arg("input")!, "utf8"));
  else {
    const id = executionId(arg("execution"));
    if (!process.env.BOLNA_API_KEY) throw new Error("BOLNA_API_KEY required");
    const response = await fetch(`https://api.bolna.ai/executions/${id}`, { headers: { Authorization: `Bearer ${process.env.BOLNA_API_KEY}` }, signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Bolna execution read HTTP ${response.status}`);
    raw = await response.json() as Record<string, unknown>;
    if (raw.id !== id) throw new Error("Execution ID mismatch");
  }
  let events: StoredEvent[] = [];
  try { events = (await readFile(process.env.KKB_EVENTS_FILE ?? "data/runtime/events.jsonl", "utf8")).split("\n").filter(Boolean).map(l => JSON.parse(l)); }
  catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
  const id = executionId(raw.id);
  await mkdir("docs/evals", { recursive: true });
  // Exclusive write preserves earlier evaluations; pending data can be retried
  // after explicitly archiving the earlier report.
  await writeFile(`docs/evals/${id}.md`, evaluationMarkdown(raw, events, callId), { flag: "wx" });
  console.log("Evaluation recorded; human review pending.");
}
main().catch(() => { console.error("Evaluation failed; verify arguments, private input, credentials and existing report."); process.exitCode = 1; });
