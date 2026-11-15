import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calibrate, initialSelector, step, type SelectorState } from "../lib/focus/selector";

function run(samples: Array<number | null>, dt = 50, start: SelectorState = calibrate(initialSelector(), 0, 0)) {
  let s = start; const emits: string[] = [];
  samples.forEach((y, i) => { const o = step(s, y, (i + 1) * dt); s = o.state; if (o.emit) emits.push(o.emit); });
  return { s, emits };
}

describe("head-turn selector (webcam / AirPods)", () => {
  it("uncalibrated input never selects anything", () => {
    const o = step(initialSelector(), 40, 100);
    assert.equal(o.emit, null);
  });
  it("a deliberate left turn with dwell selects Team Memory once", () => {
    const { emits } = run(Array(20).fill(35));
    assert.deepEqual(emits.filter((e) => e !== "leader_desk"), ["team_memory"]);
  });
  it("a quick glance (shorter than dwell) does not select", () => {
    const { emits } = run([0, 0, 40, 40, 0, 0, 0, 0, 0, 0, 0, 0]);
    assert.ok(!emits.includes("team_memory"));
  });
  it("hysteresis: jitter around the threshold does not flap", () => {
    const { emits } = run([...Array(15).fill(30), ...Array(30).fill(0).map((_, i) => (i % 2 ? 19 : 25))]);
    assert.equal(emits.filter((e) => e === "team_memory").length, 1);
  });
  it("tracking lost (camera covered / AirPods removed) freezes; no phantom selection on resume", () => {
    const { s, emits } = run([...Array(15).fill(0), null, null, null, 0, 0]);
    assert.equal(s.tracking, "ok");
    assert.ok(!emits.includes("team_memory") && !emits.includes("code_navigator"));
  });
  it("right turn selects Code Navigator; calibration offset is respected", () => {
    const { emits } = run(Array(20).fill(-25 + 10), 50, calibrate(initialSelector(), 10, 0));
    assert.ok(emits.includes("code_navigator"));
  });
});
