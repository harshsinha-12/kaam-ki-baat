import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { githubClient } from "../lib/adapters/github";

const fakeFetch = (body: unknown) => (async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;

describe("GitHub adapter", () => {
  it("drops skipped/neutral check runs instead of reporting them as failures", async () => {
    const gh = githubClient("o/r", undefined, fakeFetch({ check_runs: [
      { id: 1, name: "CodeRabbit", status: "completed", conclusion: "skipped" },
      { id: 2, name: "check", status: "completed", conclusion: "success" },
      { id: 3, name: "slow", status: "in_progress", conclusion: null },
      { id: 4, name: "bad", status: "completed", conclusion: "timed_out" },
    ] }));
    const checks = await gh.checksFor("abc1234");
    assert.deepEqual(checks.map((c) => [c.name, c.conclusion]), [["check", "success"], ["slow", "pending"], ["bad", "failure"]]);
  });
});
