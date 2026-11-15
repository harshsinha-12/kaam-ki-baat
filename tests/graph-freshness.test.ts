import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { graphFreshness } from "../lib/codegraph/freshness";

const graphSha = "317a34838683e20116940af7a2c5fc4cfe1d9771";
describe("public graph freshness contract", () => {
  it("flags a graph for an older commit instead of presenting it as current", () => {
    assert.equal(graphFreshness(graphSha, "cdcc9101fa2b1c82dbaab263339cfb0d6ebead37"), "stale");
  });
  it("treats an exact committed graph as current", () => {
    assert.equal(graphFreshness(graphSha, graphSha), "current");
    assert.equal(graphFreshness(graphSha.toUpperCase(), graphSha), "current");
  });
  it("does not infer freshness when deploy provenance is missing", () => {
    assert.equal(graphFreshness(graphSha), "unverified");
    assert.equal(graphFreshness(graphSha, "HEAD"), "unverified");
  });
});
