import test from "node:test";
import assert from "node:assert/strict";
import { importWisprMeeting, validateWisprImport } from "../lib/adapters/wispr";
import { askTeamMemory } from "../lib/zones/memory";
import { meetingContext } from "../lib/zones/meeting-context";
import { resolveDeviceActor } from "../lib/zones/identity";
import { runTool } from "../lib/tools/runtime";
import { issueCallSession } from "../lib/auth/call-session";
import { ev } from "../lib/zones/state";
import { zoneSetup } from "./helpers/zones";
import { testSnapshot } from "./helpers/snapshot";

// Synthetic Wispr-shaped data only. LIVE here exercises the importer contract,
// never establishes a provider read or a real meeting.
const doc = (id = "wispr-2") => {
  const text = "Speaker 2: The migration needs a rollback rehearsal before Friday.";
  return { meeting: { id, title: "Migration sync", source: "LIVE", sourceVersion: "synthetic-v1", fetchedAt: "2026-11-15T09:00:00Z", shareLink: "https://notes.wisprflow.ai/shared/synthetic" },
    passages: [{ kind: "meeting", id: `${id}#1`, meetingId: id, speaker: "Speaker 2", charStart: 0, charEnd: text.length, text, visibility: "team" }] };
};

test("approved Wispr import is idempotent and preserves code evidence, task states and explicit access", () => {
  const before = testSnapshot();
  const first = importWisprMeeting(before, doc(), "test approver", ["dev"]);
  assert.deepEqual(importWisprMeeting(first, doc(), "test approver", ["dev"]), first);
  assert.equal(first.label, "FIXTURE");
  assert.deepEqual(first.tasks, before.tasks);
  assert.deepEqual(first.files, before.files);
  assert.equal(first.pinnedSha, before.pinnedSha);
  assert.ok(first.participants[0].meetingIds.includes("wispr-2"));
  assert.ok(!first.participants[1].meetingIds.includes("wispr-2"));
  assert.ok(!before.meetings.some(m => m.id === "wispr-2"));
  assert.match(first.passages.at(-1)!.textHash!, /^[a-f0-9]{64}$/);
});

test("import rejects denied/empty sources, missing provenance, invalid spans, hashes, links and participant grants", () => {
  const invalid = [
    { ...doc(), passages: [] },
    { ...doc(), meeting: { ...doc().meeting, sourceVersion: "" } },
    { ...doc(), meeting: { ...doc().meeting, source: "FIXTURE" } },
    { ...doc(), meeting: { ...doc().meeting, shareLink: "javascript:alert(1)" } },
    { ...doc(), passages: [{ ...doc().passages[0], charEnd: 1 }] },
    { ...doc(), passages: [{ ...doc().passages[0], textHash: "mismatch" }] },
    { ...doc(), passages: [{ ...doc().passages[0], meetingId: "another" }] },
    { ...doc(), passages: [doc().passages[0], doc().passages[0]] },
  ];
  for (const input of invalid) assert.throws(() => validateWisprImport(input, "test"));
  assert.throws(() => validateWisprImport(doc(), " "));
  assert.throws(() => importWisprMeeting(testSnapshot(), doc(), "test", ["unknown"]));
  assert.throws(() => importWisprMeeting(testSnapshot(), { ...doc("m1"), passages: [{ ...doc("m1").passages[0], id: "m1#new" }] }, "test", []), /referenced/);
  assert.throws(() => importWisprMeeting(testSnapshot(), doc("m1"), "test", []), /change evidence/);
});

test("Team Memory reads imported passages with no fabricated task or confirmed ownership", async () => {
  const z = await zoneSetup();
  z.rt.snapshot = importWisprMeeting(z.snapshot, doc(), "test", ["dev"]);
  const r = await z.act(z.dev, "memory_ask", { question: "rollback rehearsal" });
  assert.equal(r.body.kind, "meeting_context");
  assert.match(String(r.body.speak), /rollback rehearsal/);
  assert.match(String(r.body.speak), /don't have a confirmed decision/);
  const refs = r.body.sources as { meetingTitle: string; speaker: string; charStart: number; sourceVersion: string; textHash: string }[];
  assert.equal(refs[0].meetingTitle, "Migration sync");
  assert.equal(refs[0].speaker, "Speaker 2");
  assert.equal(refs[0].sourceVersion, "synthetic-v1");
  assert.match(refs[0].textHash, /^[a-f0-9]{64}$/);
  assert.equal((await z.store.all()).filter(e => e.type === "task_update").length, 0);
  assert.equal((await z.act(z.mate, "memory_ask", { question: "rollback rehearsal" })).body.kind, "unknown");
});

test("meeting catalog and selected-meeting queries enforce approval, participant and passage access", async () => {
  const z = await zoneSetup();
  const imported = importWisprMeeting(z.snapshot, doc(), "test", ["dev"]);
  imported.meetings.push({ id: "unapproved", title: "HIDDEN TITLE", source: "LIVE", approvedBy: "" });
  imported.participants[0].meetingIds.push("unapproved");
  imported.passages.push({ ...imported.passages.at(-1)!, id: "hidden", meetingId: "unapproved", text: "HIDDEN APPROVAL" });
  imported.passages.push({ ...imported.passages.at(-2)!, id: "private-extra", meetingId: "wispr-2", text: "PRIVATE ROLLBACK", visibility: "participant" });
  z.rt.snapshot = imported;
  const catalog = await z.act(z.dev, "memory_sources");
  assert.equal(catalog.status, 200);
  assert.ok(!JSON.stringify(catalog).includes("HIDDEN TITLE"));
  assert.ok(!JSON.stringify(await z.act(z.mate, "memory_sources")).includes("Migration sync"));
  assert.equal((await z.act({ token: "invalid" }, "memory_sources")).status, 401);
  const r = await z.act(z.dev, "memory_ask", { question: "rollback", meeting_id: "wispr-2" });
  assert.ok(!JSON.stringify(r).includes("PRIVATE ROLLBACK"));
  assert.equal((await z.act(z.dev, "memory_ask", { question: "read-back", meeting_id: "wispr-2" })).body.kind, "unknown");
  assert.equal((await z.act(z.mate, "memory_ask", { question: "rollback", meeting_id: "wispr-2" })).body.kind, "unknown");
});

test("retrieval finds a relevant late passage, keeps bounded exact excerpts and handles Unicode", async () => {
  const z = await zoneSetup();
  const auth = await resolveDeviceActor(z.store, z.snapshot, z.dev.token);
  assert.ok(auth.ok);
  const s = z.snapshot;
  for (let i = 0; i < 15; i++) s.passages.push({ kind: "meeting", id: `extra-${i}`, meetingId: "m1", text: `Other discussion ${i}`, charStart: 100 + i * 30, charEnd: 118 + i * 30, visibility: "team" });
  const text = "रोलबैक rehearsal " + "migration ".repeat(500);
  s.passages.push({ kind: "meeting", id: "late", meetingId: "m1", speaker: "Speaker 3", text, charStart: 900, charEnd: 900 + text.length, visibility: "team" });
  const r = meetingContext(s, auth.actor, "रोलबैक");
  assert.equal(r.passages[0].id, "late");
  assert.equal(r.passages[0].text, text.slice(0, 2400));
  assert.equal(r.passages[0].excerptCharEnd, 3300);
  assert.equal(r.passages[0].truncated, true);
  assert.ok(r.passages.reduce((n, p) => n + p.text.length, 0) <= 12000);
  assert.equal(askTeamMemory(s, [], auth.actor, "unrelatedxyz").kind, "unknown");
});

test("browser voice uses the same ranked retrieval and never leaks participant-only passages", async () => {
  const z = await zoneSetup();
  const rt = { snapshot: z.snapshot, store: z.store, conversations: new Map() };
  for (let i = 0; i < 15; i++) rt.snapshot.passages.push({ kind: "meeting", id: `noise-${i}`, meetingId: "m1", text: "Other discussion", charStart: i * 50, charEnd: i * 50 + 16, visibility: "team" });
  const text = "Rollback rehearsal is on Friday.";
  rt.snapshot.passages.push({ kind: "meeting", id: "relevant-late", meetingId: "m1", text, charStart: 900, charEnd: 900 + text.length, visibility: "team" });
  rt.snapshot.passages.push({ kind: "meeting", id: "other-private", meetingId: "m1", text: "PRIVATE ROLLBACK SECRET", charStart: 1000, charEnd: 1023, visibility: "participant" });
  await z.store.append(ev("project_voice_binding", z.devCall.session.callId, { deviceSessionId: z.dev.session.sessionId, participantId: "dev" }));
  await z.act(z.dev, "focus", { zone: "team_memory", provider: "manual", seq: 1 });
  const r = await runTool(rt, "get_project_context", { call_token: z.devCall.token, question: "rollback rehearsal" });
  assert.equal(r.body.selectedZone, "team_memory");
  assert.match(JSON.stringify(r.body), /Rollback rehearsal/);
  assert.ok(!JSON.stringify(r.body).includes("PRIVATE ROLLBACK SECRET"));
  assert.ok(!JSON.stringify(r.body).includes("IGNORE ALL PREVIOUS"));
  const limited = await issueCallSession(z.store, { participantId: "dev", meetingIds: [], repository: rt.snapshot.repository, consentRecordedBy: "synthetic", scenario: "limited" });
  const phone = await runTool(rt, "get_task_evidence", { call_token: limited.token, focus: "memory", question: "rollback rehearsal" });
  assert.ok(!JSON.stringify(phone.body).includes("Rollback rehearsal"));
});

test("leader escalation retains the selected meeting and rejects cross-meeting retries", async () => {
  const z = await zoneSetup();
  z.rt.snapshot = importWisprMeeting(z.snapshot, doc(), "test", ["dev"]);
  const body = { question: "Who owns rollback rehearsal?", meeting_id: "wispr-2", confirmed: true, idempotency_key: "wispr-ticket-test" };
  const r = await z.act(z.dev, "ticket_create", body);
  assert.equal(r.status, 200);
  assert.equal((r.body.ticket as { meetingId: string }).meetingId, "wispr-2");
  assert.equal((await z.act(z.dev, "ticket_create", body)).body.replayed, true);
  assert.equal((await z.act(z.dev, "ticket_create", { ...body, meeting_id: "m1" })).status, 409);
  assert.equal((await z.act(z.mate, "ticket_create", body)).status, 403);
});
