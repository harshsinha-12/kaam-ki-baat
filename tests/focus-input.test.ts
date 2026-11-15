import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { zoneSetup } from "./helpers/zones";
import { focusInputStatus, focusState } from "../lib/zones/state";
import { EventStore } from "../lib/store/event-store";
import { issueDeviceSession } from "../lib/zones/identity";
import { runZoneAction } from "../lib/zones/service";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

describe("input arbitration (synthetic device sessions)", () => {
  it("keeps one global sequence across switches, rejects inactive and old-epoch events", async () => {
    const z = await zoneSetup();
    await z.act(z.dev, "focus", { zone: "team_memory", provider: "manual", seq: 500 });
    const webcam = await z.act(z.dev, "focus-input", { provider: "webcam" });
    const epoch = (webcam.body.input as { epoch: number }).epoch;
    assert.equal((webcam.body.focus as { seq: number }).seq, 500);
    assert.equal((await z.act(z.dev, "focus", { zone: "code_navigator", provider: "webcam", seq: 501, inputEpoch: epoch })).status, 200);
    const airpods = await z.act(z.dev, "focus-input", { provider: "airpods" });
    const next = (airpods.body.input as { epoch: number }).epoch;
    for (const body of [
      { provider: "webcam", seq: 502, inputEpoch: epoch },
      { provider: "webcam", seq: 10000, inputEpoch: next },
      { provider: "airpods", seq: 502, inputEpoch: epoch },
      { provider: "airpods", seq: 502 },
      { provider: "airpods", seq: 501, inputEpoch: next },
    ]) assert.equal((await z.act(z.dev, "focus", { zone: "team_memory", ...body })).status, 409);
    assert.equal(focusState(await z.store.all(), z.dev.session.sessionId).zone, "code_navigator");
    assert.equal((await z.act(z.dev, "focus", { zone: "team_memory", provider: "airpods", seq: 502, inputEpoch: next })).status, 200);
    const manual = await z.act(z.dev, "focus-input", { provider: "manual" });
    assert.equal((manual.body.focus as { seq: number }).seq, 502);
    assert.equal((await z.act(z.dev, "focus", { zone: "leader_desk", provider: "manual", seq: 503, inputEpoch: (manual.body.input as { epoch: number }).epoch })).body.locked, true);
    assert.equal(focusState(await z.store.all(), z.dev.session.sessionId).activeZone, null);
    assert.equal((await z.act(z.dev, "activate", { zone: "leader_desk", method: "click" })).status, 403);
  });

  it("serializes concurrent duplicate focus and switches; no stale callback crosses a switch", async () => {
    const z = await zoneSetup();
    const input = await z.act(z.dev, "focus-input", { provider: "webcam" });
    const epoch = (input.body.input as { epoch: number }).epoch;
    const body = { zone: "team_memory", provider: "webcam", seq: 1, inputEpoch: epoch };
    const duplicate = await Promise.all([z.act(z.dev, "focus", body), z.act(z.dev, "focus", body)]);
    assert.deepEqual(duplicate.map(x => x.status).sort(), [200, 409]);
    await z.act(z.dev, "focus-input", { provider: "manual" });
    assert.equal((await z.act(z.dev, "focus", { ...body, seq: 2 })).status, 409);
    assert.equal(focusState(await z.store.all(), z.dev.session.sessionId).seq, 1);
  });

  it("authenticates all input/status reads and writes and scopes them to the device session", async () => {
    const z = await zoneSetup();
    for (const action of ["focus-input", "focus-input-status"] as const)
      assert.equal((await runZoneAction(z.rt, action, "forged-token-not-real", {})).status, 401);
    await z.act(z.dev, "focus-input", { provider: "airpods" });
    assert.equal((await z.act(z.mate, "focus-input")).body.status, null);
    assert.equal((await z.act(z.dev, "focus-input", { provider: "webcam", role: "leader" })).status, 400);
    assert.equal((await z.act(z.dev, "focus", { zone: "team_memory", provider: "manual", seq: Number.MAX_SAFE_INTEGER + 1 })).status, 400);
  });

  it("heartbeat is epoch-bound, expires at six seconds using server receipt time, never selects", async () => {
    const z = await zoneSetup();
    await z.act(z.dev, "focus-input", { provider: "airpods" });
    const heartbeat = { inputEpoch: 1, state: "tracking", calibrated: true, lastSampleAt: "2099-01-01T00:00:00Z" };
    assert.equal((await z.act(z.dev, "focus-input-status", heartbeat)).status, 200);
    const events = await z.store.all();
    const status = focusInputStatus(events, z.dev.session.sessionId)!;
    assert.equal(status.fresh, true);
    assert.equal(focusInputStatus(events, z.dev.session.sessionId, Date.parse(status.receivedAt) + 6001)!.fresh, false);
    assert.equal(focusState(events, z.dev.session.sessionId).zone, null);
    await z.act(z.dev, "focus-input", { provider: "manual" });
    assert.equal((await z.act(z.dev, "focus-input")).body.status, null);
    assert.equal((await z.act(z.dev, "focus-input-status", heartbeat)).status, 409);
    assert.equal((await z.act(z.dev, "focus-input-status", { ...heartbeat, yaw: 40 })).status, 400);
  });

  it("explicit activation refuses a changed selection and still requires leader step-up", async () => {
    const z = await zoneSetup();
    await z.act(z.lead, "focus-input", { provider: "manual" });
    await z.act(z.lead, "focus", { zone: "leader_desk", provider: "manual", seq: 1, inputEpoch: 1 });
    const activate = { zone: "leader_desk", method: "click", expectedSeq: 1, inputEpoch: 1 };
    assert.equal((await z.act(z.lead, "activate", activate)).status, 403);
    await z.unlockLeader();
    assert.equal((await z.act(z.lead, "activate", activate)).status, 200);
    await z.act(z.lead, "focus-input", { provider: "webcam" });
    assert.equal((await z.act(z.lead, "activate", activate)).status, 409);
  });

  it("persists provider/sequence and reads back through a fresh store without creating a call", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "kkb-input-"));
    try {
      const z = await zoneSetup();
      const file = path.join(dir, "events.jsonl");
      const store = new EventStore(file);
      const device = await issueDeviceSession(store, z.snapshot, { participantId: "dev", deviceLabel: "synthetic" });
      const rt = { store, snapshot: z.snapshot };
      await runZoneAction(rt, "focus-input", device.token, { provider: "webcam" });
      await runZoneAction(rt, "focus", device.token, { provider: "webcam", zone: "code_navigator", seq: 1, inputEpoch: 1 });
      const fresh = new EventStore(file);
      const result = await runZoneAction({ ...rt, store: fresh }, "focus-input", device.token, {});
      assert.deepEqual(result.body.focus, { zone: "code_navigator", provider: "webcam", seq: 1, inputEpoch: 1, activeZone: null });
      assert.equal((await fresh.all()).filter(e => e.type === "call_session").length, 0);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});
