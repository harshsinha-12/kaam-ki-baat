import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { confirmHeard, markAttempted, markInterrupted, newReport, outstandingFacts } from "../lib/core/communication-ledger";

describe("communication ledger", () => {
  it("interruption does not mean all facts were heard", () => {
    const report = markInterrupted(markAttempted(newReport("c1", [{ id: "sha", fact: "CI is stale" }, { id: "next", fact: "Rerun checks" }]), "sha"));
    assert.deepEqual(outstandingFacts(report).map((f) => f.id), ["sha", "next"]);
  });
  it("explicit acknowledgement requires attempted announcement", () => {
    const r = newReport("c1", [{ id: "a", fact: "A" }]);
    assert.throws(() => confirmHeard(r, "a"));
    assert.deepEqual(outstandingFacts(confirmHeard(markAttempted(r, "a"), "a")), []);
  });
});
