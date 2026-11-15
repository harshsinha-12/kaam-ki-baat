import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { arcLength, bezierD1, bezierD2, bsplineToBezier, catmullRomToBezier, damp, len } from "../lib/motion/curves";

const pts = [{ x: 0, y: 0 }, { x: 100, y: 60 }, { x: 220, y: -20 }, { x: 330, y: 50 }, { x: 440, y: 0 }];
const near = (a: { x: number; y: number }, b: { x: number; y: number }, eps = 1e-6) => Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps;

describe("motion maths", () => {
  it("damp is frame-rate independent (one 1/30 s step = two 1/60 s steps)", () => {
    const once = damp(0, 100, 8, 1 / 30);
    const twice = damp(damp(0, 100, 8, 1 / 60), 100, 8, 1 / 60);
    assert.ok(Math.abs(once - twice) < 1e-9);
  });
  it("Catmull-Rom segments are C1: velocity matches at every joint", () => {
    const s = catmullRomToBezier(pts);
    for (let i = 0; i < s.length - 1; i++) assert.ok(near(bezierD1(...s[i], 1), bezierD1(...s[i + 1], 0)));
  });
  it("B-spline segments are C2: acceleration matches too", () => {
    const s = bsplineToBezier(pts);
    for (let i = 0; i < s.length - 1; i++) {
      assert.ok(near(bezierD1(...s[i], 1), bezierD1(...s[i + 1], 0)));
      assert.ok(near(bezierD2(...s[i], 1), bezierD2(...s[i + 1], 0)));
    }
  });
  it("arc-length sampling gives near-constant speed", () => {
    const { at, total } = arcLength(catmullRomToBezier(pts), 64);
    const steps = Array.from({ length: 40 }, (_, k) => len({ x: at((k + 1) / 40).x - at(k / 40).x, y: at((k + 1) / 40).y - at(k / 40).y }));
    const mean = total / 40;
    assert.ok(steps.every((d) => Math.abs(d - mean) / mean < 0.08));
  });
});
