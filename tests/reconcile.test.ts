import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { CheckRecord, PullRequestRecord, Task } from "../lib/contracts";
import { reconcileTask } from "../lib/core/reconcile";

const task: Task = { id: "t1", title: "Memory fix", meetingId: "m1", passageIds: [], assignment: { state: "mentioned", ownerId: "a" }, prNumber: 7, searchTerms: [] };
const pr: PullRequestRecord = { kind: "pr", id: "pr:7", repository: "team/repo", number: 7, title: "fix", state: "open", headSha: "f00ba7f00ba7", changedFiles: [], url: "u" };
const check = (sha: string, conclusion: CheckRecord["conclusion"] = "success"): CheckRecord => ({ kind: "check", id: `c-${sha}`, repository: "team/repo", commitSha: sha, name: "test", conclusion });

describe("reconciliation", () => {
  it("does not accept mentioned or proposed ownership", () => {
    assert.equal(reconcileTask(task, [pr], []).acceptedOwnerId, null);
    assert.equal(reconcileTask({ ...task, assignment: { state: "proposed", ownerId: "a" } }, [pr], []).acceptedOwnerId, null);
  });
  it("open PR and stale SHA remain unverified", () => {
    const r = reconcileTask(task, [pr], [check("f00ba6f00ba6")]);
    assert.equal(r.pr, "open");
    assert.equal(r.checks, "stale");
    assert.equal(r.productionVerified, false);
  });
  it("same-SHA check cannot imply PR merged", () => {
    const r = reconcileTask(task, [pr], [check("f00ba7f00ba7")]);
    assert.equal(r.checks, "passed");
    assert.equal(r.pr, "open");
  });
  it("any failure on the current SHA is a failure", () => {
    assert.equal(reconcileTask(task, [pr], [check("f00ba7f00ba7"), check("f00ba7f00ba7", "failure")]).checks, "failed");
  });
  it("merged PR is verified against the merged SHA, not the head", () => {
    const merged = { ...pr, state: "merged" as const, mergedSha: "abcabcabcabc" };
    assert.equal(reconcileTask(task, [merged], [check("f00ba7f00ba7")]).checks, "stale");
    assert.equal(reconcileTask(task, [merged], [check("abcabcabcabc")]).checks, "passed");
  });
});
