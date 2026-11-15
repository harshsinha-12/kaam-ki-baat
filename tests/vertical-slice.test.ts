import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { issueCallSession } from "../lib/auth/call-session";
import { codeScout } from "../lib/specialists/code-scout";
import { EventStore } from "../lib/store/event-store";
import { runTool, type Runtime } from "../lib/tools/runtime";
import { testSnapshot } from "./helpers/snapshot";

async function setup(participantId = "dev") {
  const rt: Runtime = { store: new EventStore(null), snapshot: testSnapshot(), conversations: new Map() };
  const { token, session } = await issueCallSession(rt.store, { participantId, meetingIds: ["m1"], repository: "team/repo", consentRecordedBy: "test", scenario: "t" });
  return { rt, token, callId: session.callId };
}

describe("Code Scout", () => {
  it("PR-changed file is confirmed; keyword-only hit stays a candidate", () => {
    const s = testSnapshot();
    const f = codeScout(s, s.tasks[0], "");
    assert.equal(f[0].path, "lib/core/persist-update.ts");
    assert.equal(f[0].match, "confirmed");
    assert.equal(f[0].symbol, "persistVerifiedUpdate");
    assert.equal(f[0].lineStart, 3); // exact definition line, not the line before
    assert.match(f[0].url, /blob\/1111111aaaaaaa\/lib\/core\/persist-update\.ts#L/);
    assert.equal(f.find((x) => x.path === "lib/other.ts")?.match, "candidate");
  });
});

describe("vertical slice: brief → interruption → code pointer → verify → verified save", () => {
  it("runs end to end and keeps task context across specialists", async () => {
    const { rt, token, callId } = await setup();
    const brief = await runTool(rt, "get_my_brief", { call_token: token });
    assert.equal(brief.status, 200);
    assert.match(String(brief.body.speak), /read-back/);
    assert.match(String(brief.body.speak), /still open/);

    // Caller interrupts: "wait, where's the code?" — answered, then the unfinished fact resumes.
    const nav = await runTool(rt, "get_task_evidence", { call_token: token, question: "wait, where is the code?" });
    assert.equal(nav.body.specialist, "fix_navigator");
    assert.match(String(nav.body.speak), /persist-update\.ts/);
    assert.match(String(nav.body.speak), /persistVerifiedUpdate/);
    assert.match(String(nav.body.speak), /before I forget/);
    assert.equal(nav.body.taskId, "t1");

    const ver = await runTool(rt, "get_task_evidence", { call_token: token, question: "did CI pass?" });
    assert.equal(ver.body.specialist, "evidence_verifier");
    assert.equal(ver.body.taskId, "t1"); // no need to repeat the question
    assert.match(String(ver.body.speak), /older commit/);
    assert.doesNotMatch(String(ver.body.speak), /checks passed/i);

    const save = await runTool(rt, "record_task_update", { call_token: token, status: "in_progress", confirmed: true, idempotency_key: `${callId}-1` });
    assert.equal(save.status, 200);
    assert.equal(save.body.saved, true);
    assert.equal((save.body.readBack as { status: string }).status, "in_progress");
    const conv = rt.conversations.get(callId)!;
    assert.equal(conv.focus.contextVersion, 2);
    assert.equal(conv.cards.evidence_verifier.evidence.some((e) => e.id === save.body.recordId), true);

    const changes = await runTool(rt, "get_changes", { call_token: token, since: "2000-01-01T00:00:00Z" });
    assert.equal((changes.body.changes as unknown[]).length, 1);
  });
});

describe("authorization is server-side", () => {
  it("rejects a missing or forged token", async () => {
    const { rt } = await setup();
    assert.equal((await runTool(rt, "get_my_brief", {})).status, 401);
    assert.equal((await runTool(rt, "get_my_brief", { call_token: "forged-token-forged-token" })).status, 401);
  });
  it("never reveals tasks from a meeting the call is not authorized for", async () => {
    const { rt, token } = await setup();
    const r = await runTool(rt, "get_task_evidence", { call_token: token, task_id: "t_private" });
    assert.equal(r.status, 403);
  });
  it("cannot read or update someone else's task, even by naming it", async () => {
    const { rt, token } = await setup();
    assert.equal((await runTool(rt, "get_task_evidence", { call_token: token, task_id: "t_lead" })).status, 403);
    const w = await runTool(rt, "record_task_update", { call_token: token, task_id: "t_lead", status: "reported_done", confirmed: true, idempotency_key: "k-12345678" });
    assert.equal(w.body.saved, false);
  });
  it("refuses to record status when ownership is disputed", async () => {
    const { rt, token } = await setup();
    const w = await runTool(rt, "record_task_update", { call_token: token, task_id: "t_disputed", status: "in_progress", confirmed: true, idempotency_key: "k-abcdefgh" });
    assert.equal(w.body.saved, false);
    assert.match(String(w.body.speak), /couldn't save/);
  });
});

describe("regressions found in dry run (2026-11-15, before any real call)", () => {
  it("interruption recovery resumes the UNSAID fact, not facts already spoken", async () => {
    const { rt, token } = await setup();
    await runTool(rt, "get_my_brief", { call_token: token });
    const nav = await runTool(rt, "get_task_evidence", { call_token: token, question: "wait, where is the code?" });
    const spoken = String(nav.body.speak);
    assert.doesNotMatch(spoken.split("before I forget")[1] ?? "", /team agreed/);
    const ver = await runTool(rt, "get_task_evidence", { call_token: token, question: "ok, did CI pass?" });
    assert.doesNotMatch(String(ver.body.speak), /before I forget/); // nothing unsaid left to resume
  });
  it("Fix Navigator prefers a real *.test.* file over a test helper", async () => {
    const s = testSnapshot();
    s.files.push({ path: "tests/helpers/aaa.ts", content: "// persistVerifiedUpdate fixture helper\n" });
    const { fixNavigator } = await import("../lib/specialists/fix-navigator");
    const plan = fixNavigator(s, codeScout(s, s.tasks[0], ""));
    assert.equal(plan.test?.path, "tests/persist-update.test.ts");
  });
});
