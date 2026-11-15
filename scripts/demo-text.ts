// Owner-authorized text preview against the real runtime, with isolated writes.
// npx tsx scripts/demo-text.ts --participant <approved-participant-id>
// No Bolna request, telephone call, or live task-status change is made.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { issueCallSession } from "../lib/auth/call-session";
import { loadSnapshot } from "../lib/evidence/load";
import { EventStore } from "../lib/store/event-store";
import { runTool, type Runtime, type ToolName } from "../lib/tools/runtime";

const index = process.argv.indexOf("--participant");
const participantId = index >= 0 ? process.argv[index + 1] : undefined;
const snapshot = loadSnapshot();
const participant = snapshot.participants.find(p => p.id === participantId);
assert.ok(participant, "--participant must identify an approved snapshot participant");
const task = snapshot.tasks.find(t => participant.taskIds.includes(t.id) && t.assignment.state === "accepted" && t.assignment.ownerId === participant.id);
assert.ok(task, "Preview save needs source-supported accepted ownership");
const id = randomUUID();
const file = `data/runtime/text-preview/${id}.jsonl`;
const store = new EventStore(file);
const rt: Runtime = { store, snapshot, conversations: new Map() };
const { token } = await issueCallSession(store, {
  participantId: participant.id, meetingIds: participant.meetingIds, repository: snapshot.repository,
  consentRecordedBy: "Owner-authorized text preview only; NOT phone-call consent", scenario: "TEXT_PREVIEW", ttlMinutes: 5,
});
const trace: Array<{ tool: ToolName; status: number; response: Record<string, unknown> }> = [];
async function call(tool: ToolName, body: Record<string, unknown> = {}) {
  const r = await runTool(rt, tool, { ...body, call_token: token });
  trace.push({ tool, status: r.status, response: r.body });
  return r;
}
assert.equal((await call("get_my_brief")).status, 200);
assert.equal((await call("get_task_evidence", { task_id: task.id, focus: "find", question: "Where is the matching implementation?" })).status, 200);
assert.equal((await call("get_task_evidence", { task_id: task.id, focus: "verify", question: "Is it merged and tested?" })).status, 200);
const update = { task_id: task.id, status: "in_progress", confirmed: true, idempotency_key: `preview-${id}` };
assert.equal((await call("record_task_update", { ...update, confirmed: false })).body.saved, false);
const saved = await call("record_task_update", update);
assert.equal(saved.body.saved, true);
const replay = await call("record_task_update", update);
assert.equal(replay.body.replayed, true);
assert.equal(replay.body.recordId, saved.body.recordId);
assert.equal((await store.read(String(saved.body.recordId)))?.status, "in_progress");
assert.equal((await call("get_changes", { since: "2000-01-01T00:00:00.000Z" })).status, 200);
const proposed = snapshot.tasks.find(t => participant.taskIds.includes(t.id) && t.assignment.state !== "accepted");
if (proposed) assert.equal((await call("record_task_update", { ...update, task_id: proposed.id, idempotency_key: `denied-${id}` })).body.saved, false);
assert.equal((await call("get_task_evidence", { task_id: "not-authorized" })).status, 403);
await mkdir("data/private/text-preview", { recursive: true });
const out = `data/private/text-preview/${id}.json`;
await writeFile(out, JSON.stringify({
  kind: "TEXT_PREVIEW", telephoneCalls: 0, statusWritesAreIsolated: true,
  snapshot: { label: snapshot.label, repository: snapshot.repository, pinnedSha: snapshot.pinnedSha, fetchedAt: snapshot.fetchedAt },
  trace,
}, null, 2), { mode: 0o600 });
console.log(`TEXT_PREVIEW passed: ${trace.length} runtime turns; ${snapshot.label} source; isolated persisted save/read-back and retry verified. No telephone call. Report: ${out}`);
