import test from "node:test";
import assert from "node:assert/strict";
import { POST } from "../app/api/workspace-session/route";
import { POST as project } from "../app/api/project/route";
import { EventStore } from "../lib/store/event-store";
import type { Runtime } from "../lib/tools/runtime";
import { issueDeviceSession, resolveDeviceActor } from "../lib/zones/identity";
import { runZoneAction } from "../lib/zones/service";
import { testSnapshot } from "./helpers/snapshot";

test("open workspace issues and renews member sessions without granting leader or extra meeting access", async () => {
  const globals = globalThis as unknown as { __kkbRuntime?: Runtime };
  const previous = globals.__kkbRuntime;
  const snapshot = testSnapshot();
  snapshot.participants.find(p => p.id === "lead")!.role = "leader";
  // Leader ordering cannot affect the automatically selected member.
  snapshot.participants.reverse();
  const rt: Runtime = { store: new EventStore(null), snapshot, conversations: new Map() };
  globals.__kkbRuntime = rt;
  const request = (token = "") => new Request("http://localhost/api/workspace-session", { method: "POST", headers: { Authorization: `Session ${token}` } });
  try {
    const response = await POST(request());
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    const { token } = await response.json();
    const actor = await resolveDeviceActor(rt.store, snapshot, token);
    assert.ok(actor.ok);
    assert.equal(actor.actor.participant.id, "dev");
    assert.equal(actor.actor.role, "member");
    assert.deepEqual(actor.actor.meetingIds, ["m1"]);
    assert.equal((await runZoneAction(rt, "me", token, {})).status, 200);
    assert.equal((await runZoneAction(rt, "leader_inbox", token, {})).status, 403);
    const voice = await project(new Request("http://localhost/api/project", { method: "POST", headers: { Authorization: `Session ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "voice", repositoryUrl: "https://github.com/team/repo" }) }));
    assert.equal(voice.status, 400, "automatic workspace access still requires explicit voice/recording consent");
    const sources = await runZoneAction(rt, "memory_sources", token, {});
    assert.doesNotMatch(JSON.stringify(sources.body), /Private/);
    const count = (await rt.store.all()).length;
    assert.equal((await (await POST(request(token))).json()).token, token);
    assert.equal((await rt.store.all()).length, count, "reconnecting reuses the persisted session");

    const expired = await issueDeviceSession(rt.store, snapshot, { participantId: "dev", deviceLabel: "expired", ttlMinutes: -1 });
    const renewed = await (await POST(request(expired.token))).json();
    assert.notEqual(renewed.token, expired.token);
    assert.ok((await resolveDeviceActor(rt.store, snapshot, renewed.token)).ok);
    assert.ok((await rt.store.all()).every(e => e.type === "zone"), "automatic connection never creates a call or recording consent");

    snapshot.participants = snapshot.participants.filter(p => p.role === "leader");
    assert.equal((await POST(request())).status, 503, "a leader-only snapshot cannot grant anonymous leader sessions");
  } finally { globals.__kkbRuntime = previous; }
});
