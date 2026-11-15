import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BrowserFocusController, type FocusTransport } from "../lib/focus/browser-controller";
import type { FocusSnapshot } from "../lib/focus/input-contracts";
import { zoneSetup } from "./helpers/zones";
import { runZoneAction, type ZoneAction } from "../lib/zones/service";

async function setup() {
  const z = await zoneSetup();
  const seen: FocusSnapshot[] = [];
  const calls: string[] = [];
  const request: FocusTransport = async (action, body = {}) => {
    calls.push(action);
    const result = await runZoneAction(z.rt, action as ZoneAction, z.dev.token, body);
    if (result.status !== 200) throw new Error(String(result.body.error));
    return result.body;
  };
  const controller = new BrowserFocusController(request, state => seen.push(state));
  return { z, request, controller, calls, seen };
}

describe("browser input ordering (simulated transports, real focus handlers)", () => {
  it("serializes rapid manual selections and resumes from the persisted sequence", async () => {
    const { z, controller } = await setup();
    await z.act(z.dev, "focus", { provider: "manual", zone: "team_memory", seq: 200 });
    await controller.switchInput("manual");
    await Promise.all([controller.select("leader_desk"), controller.select("code_navigator")]);
    assert.equal(controller.snapshot?.focus.seq, 202);
    assert.equal(controller.snapshot?.focus.zone, "code_navigator");
    assert.equal(controller.snapshot?.focus.activeZone, null);
  });

  it("discards a callback captured before provider switching, including an already queued one", async () => {
    const { controller, calls } = await setup();
    await controller.switchInput("webcam");
    const oldLease = controller.lease;
    const pending = controller.select("team_memory", oldLease);
    const switching = controller.switchInput("manual");
    await Promise.all([pending, switching]);
    await controller.select("code_navigator", oldLease);
    assert.equal(calls.filter(x => x === "focus").length, 0);
    assert.equal(controller.snapshot?.input.provider, "manual");
  });

  it("ignores an old HTTP response after a switch starts; next provider uses the server's sequence", async () => {
    const { request, seen } = await setup();
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { entered = resolve; });
    const controller = new BrowserFocusController(async (action, body) => {
      const result = await request(action, body);
      if (action === "focus") { entered(); await gate; }
      return result;
    }, s => seen.push(s));
    await controller.switchInput("webcam");
    const selection = controller.select("team_memory");
    await started;
    const count = seen.length;
    const switching = controller.switchInput("manual");
    release(); await selection;
    // The focus write may already have committed before the switch, but its
    // late response cannot produce a webcam UI update.
    assert.equal(seen.length, count);
    await switching;
    await controller.select("code_navigator");
    assert.equal(controller.snapshot?.focus.seq, 2);
    assert.equal(controller.snapshot?.focus.zone, "code_navigator");
  });

  it("follows native AirPods read-back but never writes a browser motion event for it", async () => {
    const { z, controller, calls } = await setup();
    await controller.switchInput("airpods");
    await controller.select("team_memory");
    assert.equal(calls.filter(x => x === "focus").length, 0);
    await z.act(z.dev, "focus", { provider: "airpods", inputEpoch: controller.snapshot!.input.epoch, seq: 1, zone: "code_navigator" });
    await controller.refresh();
    assert.equal(controller.snapshot?.focus.zone, "code_navigator");
    assert.equal(controller.snapshot?.focus.activeZone, null);
  });

  it("refreshes after 409 without retrying the old selection into a newer epoch", async () => {
    const { z, controller, calls } = await setup();
    await controller.switchInput("webcam");
    await z.act(z.dev, "focus-input", { provider: "manual" });
    await assert.rejects(controller.select("team_memory"), /inactive provider/);
    assert.equal(controller.snapshot?.input.provider, "manual");
    assert.equal(controller.snapshot?.focus.zone, null);
    assert.equal(calls.filter(x => x === "focus").length, 1);
  });

  it("requires a separate activation and refuses an expired input lease for queued activation", async () => {
    const { controller } = await setup();
    await controller.switchInput("manual");
    await controller.select("code_navigator");
    await controller.activate();
    assert.equal(controller.snapshot?.focus.activeZone, "code_navigator");
    await controller.select("leader_desk");
    await assert.rejects(controller.activate(), /verified team leader/);
  });

  it("suppresses queued writes and UI updates after unmount/session replacement", async () => {
    const { controller, seen, calls } = await setup();
    await controller.switchInput("webcam");
    const before = seen.length;
    const queued = controller.select("code_navigator");
    controller.dispose();
    await queued; await controller.refresh();
    assert.equal(seen.length, before);
    assert.equal(calls.filter(x => x === "focus").length, 0);
  });

  it("requires a fresh selection from a new provider before browser activation", async () => {
    const { controller, calls } = await setup();
    await controller.switchInput("manual");
    await controller.select("code_navigator");
    await controller.switchInput("webcam");
    await controller.activate();
    assert.equal(calls.filter(x => x === "activate").length, 0);
    await controller.select("team_memory");
    await controller.activate();
    assert.equal(controller.snapshot?.focus.activeZone, "team_memory");
  });
});
