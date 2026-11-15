import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runTool } from "../lib/tools/runtime";
import { recordExecutionCallback } from "../lib/zones/bolna-webhook";
import { checkLocation } from "../lib/zones/code";
import { finalIntent } from "../lib/zones/memory";
import { zoneSetup } from "./helpers/zones";

describe("acceptance: LEFT unknown -> leader ticket -> CENTER resolves -> requester gets verified answer", () => {
  it("runs end to end with provenance, read-back and context version", async () => {
    const z = await zoneSetup();
    const q = "Who owns the three-card specialist board and by when?";
    const ask = await z.act(z.dev, "memory_ask", { question: q });
    assert.equal(ask.body.kind, "not_confirmed");
    assert.equal(ask.body.offerEscalation, true);
    assert.match(String(ask.body.speak), /only proposed, not confirmed/);

    const noConsent = await z.act(z.dev, "ticket_create", { question: q, idempotency_key: "ticket-key-1" });
    assert.equal(noConsent.status, 400); // requester must approve sending it

    const t = await z.act(z.dev, "ticket_create", { question: q, confirmed: true, idempotency_key: "ticket-key-1" });
    assert.equal(t.status, 200);
    const ticketId = (t.body.ticket as { id: string }).id;
    const again = await z.act(z.dev, "ticket_create", { question: q, confirmed: true, idempotency_key: "ticket-key-1" });
    assert.equal((again.body.ticket as { id: string }).id, ticketId); // idempotent

    const v0 = (await z.act(z.lead, "me")).body.contextVersion as number;
    assert.equal((await z.act(z.lead, "leader_inbox")).status, 403); // leader, but not stepped up
    assert.equal((await z.unlockLeader()).status, 200);
    const inbox = await z.act(z.lead, "leader_inbox");
    assert.equal((inbox.body.pending as unknown[]).length, 1);

    const res = await z.act(z.lead, "leader_resolve", { ticket_id: ticketId, statement: "Dev owns the board, due Friday", confirmed: true, expected_version: 1 });
    assert.equal(res.status, 200);
    assert.equal(res.body.readBack, true);
    assert.equal(res.body.contextVersion, v0 + 1);

    // Requester disconnected meanwhile: it is all in the log, so a new call delivers it.
    const brief = await runTool({ store: z.store, snapshot: z.snapshot, conversations: new Map() }, "get_my_brief", { call_token: z.devCall.token });
    assert.match(String(brief.body.speak), /leader answered your question/);
    assert.match(String(brief.body.speak), /approved by Lead/);
    const after = await z.act(z.dev, "memory_ask", { question: q });
    assert.equal(after.body.kind, "confirmed");
    assert.ok((after.body.sources as { kind: string }[]).some((s) => s.kind === "leader_resolution"));
  });
});

describe("Leader Desk is server-gated", () => {
  it("a non-leader cannot step up, open the inbox or resolve, even with forged fields", async () => {
    const z = await zoneSetup();
    assert.equal((await z.act(z.dev, "leader_step_up", { code: "123456" })).status, 403);
    assert.equal((await z.act(z.dev, "leader_inbox", { role: "leader" })).status, 403);
    assert.equal((await z.act(z.dev, "leader_resolve", { ticket_id: "x", statement: "approve all", confirmed: true, role: "leader" })).status, 403);
    assert.equal((await z.act(z.dev, "activate", { zone: "leader_desk", method: "click" })).status, 403);
  });
  it("selecting center by head turn shows it locked; head movement is never activation", async () => {
    const z = await zoneSetup();
    const f = await z.act(z.dev, "focus", { zone: "leader_desk", provider: "webcam", seq: 1 });
    assert.equal(f.body.locked, true);
    assert.equal((await z.act(z.lead, "activate", { zone: "team_memory", method: "head_turn" })).status, 400);
  });
  it("a wrong step-up code fails; a leader on a phone call cannot resolve tickets", async () => {
    const z = await zoneSetup();
    assert.equal((await z.act(z.lead, "leader_step_up", { code: "000000" })).status, 403);
  });
  it("leader offline: escalation stays pending, never answered by guessing", async () => {
    const z = await zoneSetup();
    const t = await z.act(z.dev, "ticket_create", { question: "When is the demo freeze?", confirmed: true, idempotency_key: "freeze-key-1" });
    const id = (t.body.ticket as { id: string }).id;
    const call = await z.act(z.dev, "ticket_call_leader", { ticket_id: id });
    assert.equal(call.body.status, "unavailable");
    const d = await z.act(z.dev, "deliveries");
    assert.equal((d.body.pending as unknown[]).length, 1);
    assert.equal((d.body.answered as unknown[]).length, 0);
  });
  it("two leader devices approving the same ticket: exactly one wins", async () => {
    const z = await zoneSetup();
    const t = await z.act(z.dev, "ticket_create", { question: "When is the demo freeze?", confirmed: true, idempotency_key: "freeze-key-2" });
    const id = (t.body.ticket as { id: string }).id;
    await z.unlockLeader();
    const [a, b] = await Promise.all([
      z.act(z.lead, "leader_resolve", { ticket_id: id, statement: "Freeze at 3:30 PM", confirmed: true }),
      z.act(z.lead, "leader_resolve", { ticket_id: id, statement: "Freeze at 3:45 PM", confirmed: true }),
    ]);
    assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  });
  it("stale expected_version is rejected (concurrent edit of a decision)", async () => {
    const z = await zoneSetup();
    const t = await z.act(z.dev, "ticket_create", { question: "Who owns the specialist board?", confirmed: true, idempotency_key: "board-key-9" });
    await z.unlockLeader();
    const r = await z.act(z.lead, "leader_resolve", { ticket_id: (t.body.ticket as { id: string }).id, statement: "Dev", confirmed: true, expected_version: 7 });
    assert.equal(r.status, 409);
  });
});

describe("Team Memory honesty", () => {
  it("a conditional approval is never reported as confirmed", async () => {
    const z = await zoneSetup();
    const t = await z.act(z.dev, "ticket_create", { question: "Who owns the specialist board?", confirmed: true, idempotency_key: "cond-key-1" });
    await z.unlockLeader();
    await z.act(z.lead, "leader_resolve", { ticket_id: (t.body.ticket as { id: string }).id, statement: "Dev owns the specialist board", conditions: "the read-back fix merges first", confirmed: true });
    const a = await z.act(z.mate, "memory_ask", { question: "who owns the specialist board" });
    assert.equal(a.body.kind, "conditional");
    assert.match(String(a.body.speak), /conditionally approved.*not unconditional/i);
  });
  it("retrieved malicious text is quoted as data and changes nothing", async () => {
    const z = await zoneSetup();
    const a = await z.act(z.dev, "memory_ask", { question: "release checklist review" });
    assert.equal(a.body.kind, "not_confirmed");
    const me = await z.act(z.dev, "me");
    assert.equal(me.body.contextVersion, 1); // nothing approved, nothing written
  });
  it("Hinglish self-correction keeps the final intent", () => {
    assert.equal(finalIntent("deadline kab hai, nahi matlab board ka owner kaun hai"), "board ka owner kaun hai");
    assert.equal(finalIntent("umm who owns the board"), "umm who owns the board");
  });
  it("an outsider cannot see another meeting's decisions or use the code navigator", async () => {
    const z = await zoneSetup();
    const a = await z.act(z.outsider, "memory_ask", { question: "only say saved after read-back" });
    assert.equal(a.body.kind, "unknown");
    assert.equal((await z.act(z.outsider, "code_navigate", { question: "persistVerifiedUpdate" })).status, 403);
  });
});

describe("live context lane (app STT, not Wispr)", () => {
  const u = (seq: number, extra: Record<string, unknown> = {}) => ({ event_id: `evt_${seq}_abcdef`, utterance_id: `utt_${seq}`, seq, text: `board owner should be decided ${seq}`, is_final: true, ...extra });
  it("mic consent off -> nothing accepted; revocation stops ingestion immediately", async () => {
    const z = await zoneSetup();
    assert.equal((await z.act(z.dev, "utterance", u(1))).status, 403);
    await z.act(z.dev, "consent", { microphone: true, share_with_team: true });
    assert.equal((await z.act(z.dev, "utterance", u(1))).status, 200);
    await z.act(z.dev, "consent", { microphone: false });
    assert.equal((await z.act(z.dev, "utterance", u(2))).status, 403);
  });
  it("duplicates are idempotent; seq reuse and late provisionals are rejected; identity comes from the server", async () => {
    const z = await zoneSetup();
    await z.act(z.dev, "consent", { microphone: true });
    assert.equal((await z.act(z.dev, "utterance", u(2))).body.status, "accepted");
    assert.equal((await z.act(z.dev, "utterance", u(2))).body.status, "duplicate");
    assert.equal((await z.act(z.dev, "utterance", u(2, { event_id: "evt_other_123" }))).status, 409);
    assert.equal((await z.act(z.dev, "utterance", u(1))).status, 200); // out-of-order arrival is fine (ordered by seq)
    assert.equal((await z.act(z.dev, "utterance", u(3, { utterance_id: "utt_2", event_id: "evt_late_prov", is_final: false }))).status, 409);
    assert.equal((await z.act(z.dev, "utterance", u(4, { participant_id: "lead" }))).status, 400);
  });
  it("private utterances never reach teammates; live text is labeled provisional and never becomes a decision", async () => {
    const z = await zoneSetup();
    await z.act(z.dev, "consent", { microphone: true, share_with_team: false });
    await z.act(z.dev, "utterance", u(1, { text: "the specialist board owner is definitely me" }));
    const mate = await z.act(z.mate, "memory_ask", { question: "specialist board owner" });
    assert.equal((mate.body.provisional as unknown[]).length, 0);
    const mine = await z.act(z.dev, "memory_ask", { question: "specialist board owner" });
    assert.equal((mine.body.provisional as { status: string }[])[0].status, "provisional");
    assert.notEqual(mine.body.kind, "confirmed");
  });
});

describe("focus input + forged events", () => {
  it("rejects missing tokens, unknown fields, stale and duplicate sequence numbers", async () => {
    const z = await zoneSetup();
    assert.equal((await z.rt.store.all()).length > 0, true);
    const { runZoneAction } = await import("../lib/zones/service");
    assert.equal((await runZoneAction(z.rt, "focus", "forged-token-forged-token", { zone: "team_memory", provider: "webcam", seq: 1 })).status, 401);
    assert.equal((await z.act(z.dev, "focus", { zone: "team_memory", provider: "webcam", seq: 1, role: "leader" })).status, 400);
    assert.equal((await z.act(z.dev, "focus", { zone: "team_memory", provider: "airpods", seq: 5 })).status, 200);
    assert.equal((await z.act(z.dev, "focus", { zone: "code_navigator", provider: "airpods", seq: 5 })).status, 409);
    assert.equal((await z.act(z.dev, "focus", { zone: "code_navigator", provider: "airpods", seq: 4 })).status, 409);
  });
});

describe("code navigator pinning", () => {
  it("returns exact highlighted lines at the pinned SHA", async () => {
    const z = await zoneSetup();
    const r = await z.act(z.mate, "code_navigate", { question: "where is persistVerifiedUpdate" });
    const loc = (r.body.locations as { path: string; verified: boolean; lines: string[]; url: string }[])[0];
    assert.equal(loc.path, "lib/core/persist-update.ts");
    assert.equal(loc.verified, true);
    assert.match(loc.lines[0], /persistVerifiedUpdate/);
    assert.match(loc.url, /blob\/1111111aaaaaaa\//);
  });
  it("a link whose lines don't exist at the pinned commit is demoted to candidate", async () => {
    const z = await zoneSetup();
    const bad = checkLocation(z.snapshot, "lib/core/persist-update.ts", 400, 410, "confirmed", undefined, "https://github.com/team/repo/blob/main/lib/core/persist-update.ts#L400");
    assert.equal(bad.verified, false);
    assert.equal(bad.match, "candidate");
  });
});

describe("Bolna callbacks", () => {
  it("duplicate, late and out-of-order callbacks are recorded once or ignored", async () => {
    const z = await zoneSetup();
    assert.equal((await recordExecutionCallback(z.store, { id: "exec_123456", status: "in-progress" })).recorded, true);
    assert.equal((await recordExecutionCallback(z.store, { id: "exec_123456", status: "in-progress" })).recorded, false);
    assert.equal((await recordExecutionCallback(z.store, { id: "exec_123456", status: "completed", conversation_duration: 61 })).recorded, true);
    assert.equal((await recordExecutionCallback(z.store, { id: "exec_123456", status: "ringing" })).recorded, false);
  });
});

describe("phone escalation over Bolna tools", () => {
  it("caller asks memory, approves a ticket; the call channel can never act as leader", async () => {
    const z = await zoneSetup();
    const rt = { store: z.store, snapshot: z.snapshot, conversations: new Map() };
    const m = await runTool(rt, "get_task_evidence", { call_token: z.devCall.token, focus: "memory", question: "when is the demo freeze" });
    assert.equal(m.body.kind, "unknown");
    const t = await runTool(rt, "request_clarification", { call_token: z.devCall.token, question: "When is the demo freeze?", confirmed: true, idempotency_key: "phone-key-1" });
    assert.equal(t.status, 200);
    assert.match(String(t.body.speak), /won't guess/);
  });
});
