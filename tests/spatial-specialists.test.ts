import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { chooseSpecialist, switchFocus } from "../lib/core/spatial-specialists";

describe("focus switching", () => {
  it("navigates exact files", () => assert.equal(chooseSpecialist("Where is that file?"), "fix_navigator"));
  it("handles Hinglish", () => assert.equal(chooseSpecialist("woh code kahan hai?"), "fix_navigator"));
  it("verifies CI evidence", () => assert.equal(chooseSpecialist("Did CI pass?"), "evidence_verifier"));
  it("finds history", () => assert.equal(chooseSpecialist("what's left for me?"), "code_scout"));
  it("carries task context", () =>
    assert.deepEqual(switchFocus({ active: "code_scout", taskId: "t1", contextVersion: 3 }, "fix_navigator"), { active: "fix_navigator", taskId: "t1", contextVersion: 3 }));
});
