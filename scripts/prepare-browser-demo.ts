// Local FIXTURE preview only. Prepares one private entry link; never calls Bolna.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import assert from "node:assert/strict";
import { issueCallSession } from "../lib/auth/call-session";
import { issueDeviceSession } from "../lib/zones/identity";
import { EventStore } from "../lib/store/event-store";
import type { EvidenceSnapshot } from "../lib/contracts";

const directory = path.resolve("data/private/browser-demo");
await mkdir(path.dirname(directory), { recursive: true, mode: 0o700 });
await mkdir(directory, { recursive: false, mode: 0o700 });
const snapshot = JSON.parse(await readFile("data/demo/snapshot.fixture.json", "utf8")) as EvidenceSnapshot;
assert.equal(snapshot.label, "FIXTURE", "Demo setup must never issue access to LIVE evidence");
const participant = snapshot.participants.find(p => p.role !== "leader" && p.taskIds.length > 0);
assert.ok(participant, "Fixture member required");
const events = path.join(directory, "events.jsonl");
const store = new EventStore(events);
const device = await issueDeviceSession(store, snapshot, { participantId: participant.id, deviceLabel: "Prepared local demo", ttlMinutes: 120 });
const call = await issueCallSession(store, { participantId: participant.id, repository: snapshot.repository, meetingIds: participant.meetingIds,
  consentRecordedBy: "User-requested local FIXTURE workspace preview only; NOT consent to a voice call or recording", scenario: "fixture-input-demo", ttlMinutes: 120 });
const board = randomBytes(32).toString("base64url");
const origin = "http://localhost:3135";
const fragment = new URLSearchParams({ t: device.token, c: call.token, b: board });
const url = `${origin}/board#${fragment}`;
const environment = {
  KKB_SNAPSHOT: path.resolve("data/demo/snapshot.fixture.json"), KKB_EVENTS_FILE: events,
  KKB_BOARD_KEY: board, KKB_TOOL_KEY: randomBytes(32).toString("base64url"), KKB_ENABLE_WEB_CALLS: "false",
  KKB_ORIGIN: origin, KKB_RP_ID: "localhost", KKB_PUBLIC_URL: origin,
};
await writeFile(path.join(directory, "server.env"), Object.entries(environment).map(([key, value]) => `${key}=${value}`).join("\n") + "\n", { mode: 0o600 });
await writeFile(path.join(directory, "entry-url.txt"), url, { mode: 0o600 });
await writeFile(path.join(directory, "start.html"), `<!doctype html><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>Kaam Ki Baat demo</title><body style="font:20px system-ui;background:#111;color:#eee;padding:60px"><h1>Your workspace is ready</h1><p>No tokens to copy. Open the demo, choose Webcam, and start the camera.</p><a style="display:inline-block;padding:16px 24px;background:#e6bd67;color:#111;border-radius:12px;text-decoration:none" href="${url.replaceAll("&", "&amp;")}">Open demo</a><p style="font-size:14px">Local fixture preview · browser calling disabled · expires in two hours.</p></body>`, { mode: 0o600 });
console.log(`Prepared private demo entry: ${path.join(directory, "start.html")}. No provider session or call started.`);
