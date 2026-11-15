import { it } from "node:test";
import assert from "node:assert/strict";
import { issueCallSession } from "../lib/auth/call-session";
import { runTool } from "../lib/tools/runtime";
import { zoneSetup } from "./helpers/zones";
import { leaderCode } from "../lib/zones/identity";
import { SECRET } from "./helpers/zones";

const remark = { event_id: "review_event_123", utterance_id: "review_utterance", seq: 1, text: "specialist board owner update", is_final: true };

it("team-shared live remarks stay within their meeting and stop sharing after withdrawal", async () => {
  const z = await zoneSetup();
  await z.act(z.dev, "consent", { microphone: true, share_with_team: true });
  await z.act(z.dev, "utterance", remark);
  assert.equal(((await z.act(z.mate, "memory_ask", { question: "specialist board owner" })).body.provisional as unknown[]).length, 1);
  assert.equal(((await z.act(z.outsider, "memory_ask", { question: "specialist board owner" })).body.provisional as unknown[]).length, 0);
  await z.act(z.dev, "consent", { microphone: true, share_with_team: false });
  assert.equal(((await z.act(z.mate, "memory_ask", { question: "specialist board owner" })).body.provisional as unknown[]).length, 0);
});

it("a narrower call session cannot retrieve an older clarification from another meeting", async () => {
  const z = await zoneSetup();
  const t = await z.act(z.dev, "ticket_create", { question: "When is the demo freeze?", confirmed: true, idempotency_key: "review-narrow-call" });
  await z.unlockLeader();
  assert.equal((await z.act(z.lead, "leader_resolve", { ticket_id: (t.body.ticket as { id: string }).id, statement: "PRIVATE M1 ANSWER", confirmed: true, expected_version: 0 })).status, 200);
  const session = await issueCallSession(z.store, { participantId: "dev", meetingIds: ["m2"], repository: z.snapshot.repository, consentRecordedBy: "synthetic review", scenario: "scope-review" });
  const result = await runTool({ store: z.store, snapshot: z.snapshot, conversations: new Map() }, "get_my_brief", { call_token: session.token });
  assert.doesNotMatch(String(result.body.speak), /PRIVATE M1 ANSWER/);
});

it("leader approval requires an explicit expected version", async () => {
  const z = await zoneSetup();
  const t = await z.act(z.dev, "ticket_create", { question: "When is the demo freeze?", confirmed: true, idempotency_key: "review-version-required" });
  await z.unlockLeader();
  assert.equal((await z.act(z.lead, "leader_resolve", { ticket_id: (t.body.ticket as { id: string }).id, statement: "Friday", confirmed: true })).status, 400);
});

it("reusing a clarification key for a different question is rejected", async () => {
  const z = await zoneSetup();
  const body = { confirmed: true, idempotency_key: "review-key-collision" };
  assert.equal((await z.act(z.dev, "ticket_create", { ...body, question: "When is the demo freeze?" })).status, 200);
  assert.equal((await z.act(z.dev, "ticket_create", { ...body, question: "Who owns the specialist board?" })).status, 409);
});

it("a lost ticket response can be retried after the leader has already answered", async () => {
  const z = await zoneSetup();
  const request = { question: "When is the demo freeze?", confirmed: true, idempotency_key: "review-retry-after-answer" };
  const created = await z.act(z.dev, "ticket_create", request);
  const id = (created.body.ticket as { id: string }).id;
  await z.unlockLeader();
  assert.equal((await z.act(z.lead, "leader_resolve", { ticket_id: id, statement: "Friday", confirmed: true, expected_version: 0 })).status, 200);
  const retry = await z.act(z.dev, "ticket_create", request);
  assert.equal(retry.status, 200);
  assert.equal(retry.body.replayed, true);
  assert.equal((retry.body.ticket as { id: string; state: string }).id, id);
  assert.equal((retry.body.ticket as { state: string }).state, "answered");
  const phoneRetry = await runTool({ store: z.store, snapshot: z.snapshot, conversations: new Map() }, "request_clarification", { ...request, call_token: z.devCall.token });
  assert.equal(phoneRetry.status, 200);
  assert.match(String(phoneRetry.body.speak), /already saved.*answered: Friday/);
});

it("the opening brief retains leader answers while keeping unlinked-code claims uncertain", async () => {
  const z = await zoneSetup();
  z.snapshot.tasks.find(t => t.id === "t1")!.prNumber = undefined;
  const ticket = await z.act(z.dev, "ticket_create", { question: "When is the demo freeze?", confirmed: true, idempotency_key: "merged-opening-brief" });
  await z.unlockLeader();
  await z.act(z.lead, "leader_resolve", { ticket_id: (ticket.body.ticket as { id: string }).id, statement: "Friday", confirmed: true, expected_version: 0 });
  const brief = await runTool({ store: z.store, snapshot: z.snapshot, conversations: new Map() }, "get_my_brief", { call_token: z.devCall.token });
  assert.equal(brief.status, 200);
  assert.match(String(brief.body.speak), /leader answered.*Friday/);
  assert.match(String(brief.body.speak), /possible code match/);
  assert.doesNotMatch(String(brief.body.speak), /show you exactly where the code is/);
  assert.equal((brief.body.deliveredClarifications as string[]).length, 1);
});

it("leader step-up proofs are one-time and failed guesses are bounded", async () => {
  const z = await zoneSetup();
  assert.equal((await z.unlockLeader()).status, 200);
  assert.equal((await z.unlockLeader()).status, 403);
  const other = await zoneSetup();
  const correct = leaderCode(SECRET, other.lead.session.sessionId);
  const wrong = correct === "000000" ? "000001" : "000000";
  for (let i = 0; i < 5; i++) assert.equal((await other.act(other.lead, "leader_step_up", { code: wrong })).status, 403);
  assert.equal((await other.unlockLeader()).status, 403);
});

it("accepted tasks without source evidence are unconfirmed and participant passages stay private", async () => {
  const z = await zoneSetup();
  const task = z.snapshot.tasks.find(t => t.id === "t_board")!;
  task.assignment.state = "accepted";
  assert.equal((await z.act(z.dev, "memory_ask", { question: "three-card specialist board" })).body.kind, "not_confirmed");
  const response = await z.act(z.mate, "memory_ask", { question: "only say saved after read-back" });
  assert.equal(response.body.kind, "unknown");
});
