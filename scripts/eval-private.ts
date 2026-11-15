// Small opt-in E1 path. Existing eval-call.ts metadata export stays unchanged.
import { lstat, mkdir, readFile, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import type { EvidenceSnapshot } from "../lib/contracts";
import { EventStore, type StoredEvent } from "../lib/store/event-store";
import { executionId } from "../lib/eval/recorder";
import { digest, evaluatePrivate, scopeAudit, type EvaluationInput } from "../lib/eval/private";
import { savePrivateEvaluation } from "../lib/eval/private-store";

const allowed = new Set(["input", "execution", "call-id", "events", "snapshot", "consent", "manifest", "attempt"]);
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === "string");
function validEvent(v: unknown): boolean {
  if (!object(v) || typeof v.at !== "string") return false;
  const text = (...names: string[]) => names.every(k => typeof v[k] === "string");
  switch (v.type) {
    case "tool_call": return text("callId", "tool", "summary") && typeof v.ok === "boolean" && strings(v.evidenceIds);
    case "call_execution": return text("callId", "executionId", "agentId") && ["web", "phone"].includes(String(v.channel));
    case "call_session": {
      const s = v.session;
      return object(s) && ["callId", "participantId", "repository", "consentRecordedBy", "scenario", "tokenHash", "expiresAt"]
        .every(k => typeof s[k] === "string") && strings(s.meetingIds);
    }
    case "task_update": {
      const r = v.record;
      return object(r) && ["id", "taskId", "actorId", "idempotencyKey", "at"].every(k => typeof r[k] === "string")
        && (r.callId === null || typeof r.callId === "string") && ["not_started", "in_progress", "blocked", "reported_done"].includes(String(r.status));
    }
    case "zone": return text("kind", "key") && object(v.data);
    case "communicated": return text("callId", "factId", "fact") && typeof v.acknowledged === "boolean";
    default: return false;
  }
}
async function main() {
  const args: Record<string, string> = {};
  for (let i = 2; i < process.argv.length; i += 2) {
    const name = process.argv[i].replace(/^--/, "");
    if (!process.argv[i].startsWith("--") || !allowed.has(name) || args[name] || !process.argv[i + 1] || process.argv[i + 1].startsWith("--")) throw new Error("Arguments");
    args[name] = process.argv[i + 1];
  }
  if (!args["call-id"] || !!args.input === !!args.execution || !args.events) throw new Error("Explicit input, local call and audit path required");
  const sources: Record<string, { path: string; sha256: string | null; hashKind: string }> = {};
  async function optional(name: string, lines = false): Promise<unknown> {
    if (!args[name]) return null;
    const file = path.resolve(args[name]);
    try {
      const text = await readFile(file, "utf8");
      const parsed = lines ? text.split("\n").filter(l => l.trim()).map(l => JSON.parse(l)) : JSON.parse(text);
      sources[name] = { path: file, sha256: createHash("sha256").update(text).digest("hex"), hashKind: "raw file bytes" }; return parsed;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      sources[name] = { path: file, sha256: null, hashKind: "unavailable" }; return null;
    }
  }
  let raw: Record<string, unknown>;
  if (args.input) raw = await optional("input") as Record<string, unknown>;
  else {
    const id = executionId(args.execution);
    if (!process.env.BOLNA_API_KEY) throw new Error("Credential required");
    const response = await fetch(`https://api.bolna.ai/executions/${id}`, {
      headers: { Authorization: `Bearer ${process.env.BOLNA_API_KEY}` }, signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error("Provider read failed");
    raw = await response.json();
    if (raw.id !== id) throw new Error("Execution mismatch");
    sources.execution = { path: "Bolna get_execution", sha256: digest(raw), hashKind: "canonical JSON" };
  }
  const id = executionId(raw?.id);
  const captured = await optional("events", true) as StoredEvent[] | null;
  if (captured && (!Array.isArray(captured) || !captured.every(validEvent))) throw new Error("Invalid audit");
  const events = captured ? scopeAudit(captured, args["call-id"], id) : null;
  const input: EvaluationInput = {
    execution: raw, callId: args["call-id"], events, snapshot: await optional("snapshot") as EvidenceSnapshot | null,
    consent: await optional("consent") as EvaluationInput["consent"], manifest: await optional("manifest") as EvaluationInput["manifest"],
    attempt: await optional("attempt") as EvaluationInput["attempt"], readBacks: null,
  };
  if (events) {
    const fresh = new EventStore(path.resolve(args.events));
    const ids = [...new Set(events.filter(e => e.type === "task_update").map(e => e.record.id))];
    input.readBacks = (await Promise.all(ids.map(id => fresh.read(id)))).filter(r => r !== null);
  }
  const evaluation = evaluatePrivate(input);
  // Fixed ignored destination; never allow an operator typo to export raw input.
  const privateRoot = path.resolve("data/private");
  await mkdir(privateRoot, { recursive: true, mode: 0o700 });
  if ((await lstat(privateRoot)).isSymbolicLink()
    || await realpath(privateRoot) !== path.join(await realpath(process.cwd()), "data/private")) throw new Error("Private path required");
  const evaluatorSourceHash = digest(await Promise.all([
    new URL("../lib/eval/private.ts", import.meta.url), new URL("../lib/eval/private-store.ts", import.meta.url), new URL(import.meta.url),
  ].map(file => readFile(file, "utf8"))));
  const result = await savePrivateEvaluation(path.join(privateRoot, "evaluations"), { schemaVersion: 1, evaluatorSourceHash, sources, input, evaluation });
  console.log(`Private evaluation ${result.replayed ? "replayed" : "saved"} and read back: ${result.file}`);
  for (const [name, c] of Object.entries(evaluation.checks)) console.log(`${name}: ${c.verdict}`);
}
main().catch(() => { console.error("Private evaluation failed; verify explicit paths, JSON, correlation inputs and private output permissions. No raw provider data exported."); process.exitCode = 1; });
