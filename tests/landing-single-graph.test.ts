import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const landing = readFileSync("app/landing/Landing.tsx", "utf8");
const styles = readFileSync("app/landing/landing.module.css", "utf8");

describe("landing has one graph presentation", () => {
  it("retains the opening interactive graph", () => {
    assert.match(landing, /<section id="demo" className=\{s\.section\}>\s*<DemoGraph/);
    assert.match(landing, /import \{ DemoGraph \} from/);
  });
  it("removes the redundant lower function graph and dead anchor", () => {
    assert.doesNotMatch(landing, /function GraphSection\(/);
    assert.doesNotMatch(landing, /<GraphSection\s*\/>/);
    assert.doesNotMatch(landing, /Find a function\./);
    assert.doesNotMatch(landing, /id="graph"|href="#graph"/);
    assert.doesNotMatch(styles, /\.graphBox|\.graphCanvas|\.graphSide|\.graphSteps|\.graphQ\b/);
  });
  it("preserves the separate product code navigation UI", () => {
    assert.match(landing, /<CodeNav\s*\/>/);
    assert.match(landing, /<Architecture\s*\/>/);
  });
});
