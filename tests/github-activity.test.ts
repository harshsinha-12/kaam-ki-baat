import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GITHUB_ACTIVITY, activityPercents } from "../app/landing/github-activity";

describe("github activity split", () => {
  it("rounds the fetched public year to the profile chart", () => {
    const p = activityPercents(GITHUB_ACTIVITY);
    assert.equal(p.total, 943 + 9 + 118 + 2);
    assert.deepEqual(
      { commits: p.commits, codeReview: p.codeReview, pullRequests: p.pullRequests, issues: p.issues },
      { commits: 88, codeReview: 1, pullRequests: 11, issues: 0 },
    );
    assert.equal(p.commits + p.codeReview + p.pullRequests + p.issues, 100);
  });
  it("renders the cross on the landing evals section", () => {
    const landing = readFileSync("app/landing/Landing.tsx", "utf8");
    assert.match(landing, /<GithubActivity run=\{run\} \/>/);
    for (const label of ["Code review", "Pull requests", "Commits", "Issues", "A year on GitHub"]) {
      assert.match(landing, new RegExp(label));
    }
  });
});
