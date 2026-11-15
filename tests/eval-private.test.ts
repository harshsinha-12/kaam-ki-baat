import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { digest, evaluatePrivate, scopeAudit, type EvaluationInput } from "../lib/eval/private";
import { savePrivateEvaluation } from "../lib/eval/private-store";
import type { StoredEvent } from "../lib/store/event-store";
import type { SavedUpdate } from "../lib/core/persist-update";
import { testSnapshot } from "./helpers/snapshot";

const id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const agent = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const callId = "call_synthetic";
const at = (s: number) => `2026-11-15T08:00:${String(s).padStart(2, "0")}.000Z`;
const tool = (name: string, second: number, ok = true, evidenceIds: string[] = []): StoredEvent =>
  ({ type: "tool_call", at: at(second), callId, tool: name, ok, evidenceIds, summary: "PRIVATE synthetic result" });
function fixture(): EvaluationInput {
  const snapshot = testSnapshot();
  return {
    execution: { id, agent_id: agent, agent_version_id: agent, status: "completed", conversation_duration: 48, created_at: at(5), transcript: "PRIVATE synthetic transcript" },
    callId, snapshot, consent: { participantId: "dev", consentToCall: true, consentToRecording: true, recordedAt: at(0) },
    manifest: { callId, participantId: "dev", snapshotSha: snapshot.pinnedSha },
    attempt: { callId, executionId: id, state: "submitted", submittedAt: at(5) }, readBacks: [],
    events: [
      { type: "call_session", at: at(1), session: { callId, tokenHash: "hash", participantId: "dev", meetingIds: ["m1"], repository: snapshot.repository, consentRecordedBy: "PRIVATE consent", scenario: "SYNTHETIC", expiresAt: "2026-11-15T09:00:00Z" } },
      tool("get_my_brief", 2), // setup preflight, NOT voice evidence
      { type: "call_execution", at: at(6), callId, executionId: id, agentId: agent, channel: "phone" },
      { type: "zone", at: at(10), kind: "bolna_execution", key: id, data: { status: "in-progress", agentId: agent } },
      tool("get_task_evidence", 20, false), tool("get_my_brief", 30),
      { type: "zone", at: at(50), kind: "bolna_execution", key: id, data: { status: "call-disconnected", agentId: agent } },
      tool("get_my_brief", 55), // operator lookup after disconnect
    ],
  };
}
const result = (input: EvaluationInput, name: string) => evaluatePrivate(input).checks[name].verdict;
const addWrite = (input: EvaluationInput) => {
  const record: SavedUpdate = { id: "upd_synthetic", taskId: "t1", actorId: "dev", callId, status: "in_progress", idempotencyKey: "synthetic-update", at: at(40) };
  input.events!.push({ type: "task_update", at: record.at, record }, tool("record_task_update", 41, true, [record.id]));
  input.readBacks = [structuredClone(record)]; return record;
};

describe("private deterministic call evaluation (all inputs synthetic)", () => {
  it("bounds voice-tool attribution and preserves the first genuine failure", () => {
    const evaluated = evaluatePrivate(fixture());
    assert.equal(evaluated.tools?.length, 2);
    assert.equal(evaluated.excludedToolEvents, 2);
    assert.deepEqual(evaluated.tools?.map(t => [t.tool, t.ok]), [["get_task_evidence", false], ["get_my_brief", true]]);
    assert.equal(evaluated.checks.tools.verdict, "fail");
    assert.equal(evaluated.checks.eligibility.verdict, "inconclusive");
    assert.equal(evaluated.checks.persistedWrites.verdict, "inconclusive");
  });
  it("requires final data and strictly more than 45 seconds", () => {
    for (const [value, expected] of [[45, "fail"], [45.01, "pass"], [null, "inconclusive"], [-1, "inconclusive"], ["60", "inconclusive"]]) {
      const input = fixture(); input.execution.conversation_duration = value;
      assert.equal(result(input, "duration"), expected);
    }
    const input = fixture(); input.execution.status = "call-disconnected";
    assert.equal(result(input, "duration"), "inconclusive");
    input.execution.status = "failed";
    assert.equal(result(input, "eligibility"), "fail");
  });
  it("does not turn absent audit, missing lifecycle bounds or ambiguous links into passes", () => {
    const missing = fixture(); missing.events = null;
    assert.equal(result(missing, "correlation"), "inconclusive");
    assert.equal(evaluatePrivate(missing).tools, null);
    const noAgent = fixture(); delete noAgent.execution.agent_id;
    assert.equal(result(noAgent, "correlation"), "inconclusive");
    const unbounded = fixture(); unbounded.events = unbounded.events!.filter(e => e.type !== "zone");
    assert.equal(result(unbounded, "auditWindow"), "inconclusive");
    assert.equal(evaluatePrivate(unbounded).tools, null);
    const onlyCompleted = fixture();
    onlyCompleted.events = onlyCompleted.events!.map(e => e.type === "zone" && e.data.status === "call-disconnected" ? { ...e, data: { ...e.data, status: "completed" } } : e);
    assert.equal(result(onlyCompleted, "auditWindow"), "inconclusive");
    const conflict = fixture(); conflict.events!.push({ type: "call_execution", at: at(6), callId: "another", executionId: id, agentId: agent, channel: "phone" });
    assert.equal(result(conflict, "correlation"), "fail");
    assert.equal(evaluatePrivate(conflict).tools, null);
    const duplicate = fixture(); duplicate.events!.push(structuredClone(duplicate.events![2]));
    assert.equal(result(duplicate, "correlation"), "pass");
  });
  it("checks explicit consent participant/chronology and repository-SHA source binding", () => {
    for (const mutate of [(i: EvaluationInput) => { i.consent = null; }, (i: EvaluationInput) => { delete i.consent!.consentToRecording; }]) {
      const input = fixture(); mutate(input); assert.equal(result(input, "consent"), "inconclusive");
    }
    for (const change of [{ participantId: "other" }, { recordedAt: at(30) }, { consentToRecording: false }]) {
      const input = fixture(); Object.assign(input.consent!, change); assert.equal(result(input, "consent"), "fail");
    }
    const naive = fixture(); naive.consent!.recordedAt = "2026-11-15T08:00:00";
    assert.equal(result(naive, "consent"), "inconclusive");
    const changed = fixture(); changed.manifest!.snapshotSha = "another-sha";
    assert.equal(result(changed, "source"), "fail");
    delete changed.manifest!.snapshotSha;
    assert.equal(result(changed, "source"), "inconclusive");
  });
  it("requires persisted write, successful matching receipt, fresh read-back and accepted scoped ownership", () => {
    const good = fixture(); addWrite(good);
    assert.equal(result(good, "persistedWrites"), "pass");
    assert.equal(result(good, "explicitConfirmation"), "inconclusive");
    const absentRead = fixture(); addWrite(absentRead); absentRead.readBacks = [];
    assert.equal(result(absentRead, "persistedWrites"), "inconclusive");
    const noReceipt = fixture(); addWrite(noReceipt); noReceipt.events = noReceipt.events!.filter(e => e.type !== "tool_call" || e.tool !== "record_task_update");
    assert.equal(result(noReceipt, "persistedWrites"), "inconclusive");
    const mismatch = fixture(); addWrite(mismatch); mismatch.readBacks![0].status = "blocked";
    assert.equal(result(mismatch, "persistedWrites"), "fail");
    const proposed = fixture(); addWrite(proposed); proposed.snapshot!.tasks[0].assignment.state = "proposed";
    assert.equal(result(proposed, "persistedWrites"), "fail");
    const privateMeeting = fixture(); const record = addWrite(privateMeeting); record.taskId = "t_private";
    privateMeeting.readBacks = [structuredClone(record)];
    assert.equal(result(privateMeeting, "persistedWrites"), "fail");
    const unbound = fixture(); addWrite(unbound); unbound.manifest = null;
    assert.equal(result(unbound, "persistedWrites"), "inconclusive");
    const failedLater = fixture(); addWrite(failedLater); failedLater.events!.push(tool("record_task_update", 45, false));
    assert.equal(result(failedLater, "persistedWrites"), "fail");
    const unpairedLater = fixture(); addWrite(unpairedLater); unpairedLater.events!.push(tool("record_task_update", 45, true, ["missing-record"]));
    assert.equal(result(unpairedLater, "persistedWrites"), "inconclusive");
  });
  it("preserves a missing task/PR link and scopes private audit to the selected call", () => {
    const input = fixture(); input.snapshot!.tasks.forEach(t => { delete t.prNumber; });
    input.events!.push(tool("record_task_update", 43, true, ["unrelated"]));
    const other = { ...tool("get_my_brief", 20), callId: "other" } as StoredEvent;
    input.events!.push(other);
    assert.equal(evaluatePrivate(input).source?.confirmedTaskPrLinks, 0);
    assert.ok(!scopeAudit(input.events!, callId, id).includes(other));
    assert.equal(result(input, "persistedWrites"), "inconclusive");
    const privateTask = input.snapshot!.tasks.find(t => t.id === "t_private")!;
    privateTask.prNumber = 2;
    const session = input.events!.find(e => e.type === "call_session");
    if (session?.type === "call_session") session.session.meetingIds.push("m2");
    assert.equal(evaluatePrivate(input).source?.confirmedTaskPrLinks, 0, "a call token cannot broaden the participant's meeting scope");
  });
});

describe("private immutable evaluation persistence", () => {
  it("publishes one complete private run under concurrent retries and verifies fresh read-back", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "kkb-eval-"));
    try {
      const payload = { input: fixture(), evaluation: evaluatePrivate(fixture()) };
      const runs = await Promise.all(Array.from({ length: 8 }, () => savePrivateEvaluation(directory, payload)));
      assert.equal(new Set(runs.map(r => r.runId)).size, 1);
      assert.equal(runs.filter(r => !r.replayed).length, 1);
      assert.equal((await readdir(directory)).length, 1);
      assert.equal((await stat(runs[0].file)).mode & 0o777, 0o600);
      assert.equal(digest(JSON.parse(await readFile(runs[0].file, "utf8")).payload), runs[0].runId);
      const changed = await savePrivateEvaluation(directory, { ...payload, correction: "new evidence" });
      assert.notEqual(changed.runId, runs[0].runId);
      await writeFile(runs[0].file, "{}", { mode: 0o600 });
      await assert.rejects(savePrivateEvaluation(directory, payload), /read-back mismatch/);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});

describe("private evaluation CLI", () => {
  it("keeps raw data private, retries unchanged input, and retains missing evidence as inconclusive", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "kkb-eval-cli-"));
    try {
      const input = fixture();
      input.execution.user_number = "PRIVATE_PROVIDER_SENTINEL";
      const files = { execution: input.execution, events: input.events, snapshot: input.snapshot, consent: input.consent, manifest: input.manifest, attempt: input.attempt };
      for (const [name, value] of Object.entries(files)) await writeFile(path.join(directory, `${name}.json`), name === "events"
        ? input.events!.map(e => JSON.stringify(e)).join("\n") + "\n" : JSON.stringify(value), { mode: 0o600 });
      const executable = path.resolve("node_modules/.bin/tsx");
      const script = path.resolve("scripts/eval-private.ts");
      const args = [script, "--input", "execution.json", "--call-id", callId, "--events", "events.json", "--snapshot", "snapshot.json", "--consent", "consent.json", "--manifest", "manifest.json", "--attempt", "attempt.json"];
      const run = () => promisify(execFile)(executable, args, { cwd: directory });
      const first = await run(), retry = await run();
      assert.match(first.stdout, /saved and read back/); assert.match(retry.stdout, /replayed and read back/);
      assert.doesNotMatch(first.stdout + first.stderr + retry.stdout + retry.stderr, /PRIVATE|synthetic transcript/);
      const saved = path.join(directory, "data/private/evaluations");
      assert.equal((await readdir(saved)).length, 1);
      await assert.rejects(stat(path.join(directory, "docs")), { code: "ENOENT" });
      const missing = await promisify(execFile)(executable, [script, "--input", "execution.json", "--call-id", callId, "--events", "missing.json"], { cwd: directory });
      assert.match(missing.stdout, /correlation: inconclusive/);
      assert.match(missing.stdout, /consent: inconclusive/);
      assert.match(missing.stdout, /persistedWrites: inconclusive/);
      const malformed = input.events!.map(e => e.type === "tool_call" ? { ...e, ok: "true" } : e);
      await writeFile(path.join(directory, "events.json"), malformed.map(e => JSON.stringify(e)).join("\n"));
      await assert.rejects(run(), (e: unknown) => {
        const error = e as { stdout: string; stderr: string };
        assert.equal(error.stdout, ""); assert.doesNotMatch(error.stderr, /PRIVATE|sentinel|synthetic transcript/);
        return true;
      });
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
