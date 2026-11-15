// Run against the local server with FIXTURE data only; never places a call.
// node --env-file=.env.local --import tsx scripts/smoke-http.ts
import assert from "node:assert/strict";
import path from "node:path";
import { issueCallSession } from "../lib/auth/call-session";
import { loadSnapshot } from "../lib/evidence/load";
import { EventStore } from "../lib/store/event-store";

const snapshot = loadSnapshot();
assert.equal(snapshot.label, "FIXTURE", "HTTP smoke creates synthetic writes and requires a FIXTURE snapshot");
assert.ok(process.env.KKB_TOOL_KEY && process.env.KKB_BOARD_KEY, "Local server keys are required");
const base = "http://127.0.0.1:3000";
async function request(endpoint: string, body?: Record<string, unknown>, authorized = false) {
  const response = await fetch(`${base}${endpoint}`, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", ...(authorized ? { Authorization: `Bearer ${process.env.KKB_TOOL_KEY}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10_000),
  });
  return { status: response.status, body: await response.json() as Record<string, any> };
}

assert.equal((await request("/api/tools/get_my_brief", {})).status, 401);
assert.equal((await request("/api/board")).status, 401);
assert.equal((await request("/api/tools/no_such_tool", {})).status, 404);
assert.equal((await request("/api/tools/get_my_brief", { call_token: "not-a-valid-token" }, true)).status, 401);

// Confirm the running server is using the same FIXTURE before issuing a token
// or writing synthetic events. This prevents a stale local config targeting a
// server that was restarted with real evidence.
const boardPath = `/api/board?key=${encodeURIComponent(process.env.KKB_BOARD_KEY!)}`;
const before = await request(boardPath);
assert.equal(before.status, 200);
assert.equal(before.body.snapshot.label, "FIXTURE", "Running server must also be a FIXTURE");
assert.equal(before.body.snapshot.pinnedSha, snapshot.pinnedSha, "Server snapshot differs; restart it first");
const participant = snapshot.participants.find(p => p.taskIds.some(id => snapshot.tasks.some(t => t.id === id && t.assignment.state === "accepted" && t.assignment.ownerId === p.id)));
assert.ok(participant, "Fixture needs an accepted task");
const task = snapshot.tasks.find(t => participant.taskIds.includes(t.id) && t.assignment.state === "accepted" && t.assignment.ownerId === participant.id)!;
const store = new EventStore(path.resolve(process.env.KKB_EVENTS_FILE ?? "data/runtime/events.jsonl"));
const { token, session } = await issueCallSession(store, {
  participantId: participant.id, meetingIds: participant.meetingIds, repository: snapshot.repository,
  consentRecordedBy: "synthetic HTTP smoke; no telephone call", scenario: "synthetic-http-smoke", ttlMinutes: 5,
});
const call = async (tool: string, body: Record<string, unknown> = {}) => request(`/api/tools/${tool}`, { ...body, call_token: token }, true);
assert.equal((await call("get_my_brief")).status, 200);
assert.equal((await call("get_task_evidence", { task_id: task.id, focus: "locate", question: "Which function?" })).body.taskId, task.id);
const update = { task_id: task.id, status: "in_progress", confirmed: true, idempotency_key: `${session.callId}-smoke` };
const saved = await call("record_task_update", update);
assert.equal(saved.status, 200);
assert.equal(saved.body.saved, true);
assert.equal(saved.body.readBack.status, "in_progress");
const retry = await call("record_task_update", update);
assert.equal(retry.body.replayed, true);
assert.equal(retry.body.recordId, saved.body.recordId);
const persisted = await store.read(saved.body.recordId);
assert.equal(persisted?.status, "in_progress");
assert.equal(persisted?.callId, session.callId);
const changes = await call("get_changes", { since: "2000-01-01T00:00:00.000Z" });
assert.ok(changes.body.changes.some((c: { recordId: string }) => c.recordId === saved.body.recordId));
const board = await request(boardPath);
assert.equal(board.body.conversation.callId, session.callId);
console.log("FIXTURE HTTP smoke passed: auth, brief, evidence, persisted read-back, retry, changes and board. No telephone call.");
