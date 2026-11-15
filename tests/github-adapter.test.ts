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


describe("GitHub pagination and errors", () => {
  it("reads every file and check page and preserves the reported SHA", async () => {
    const urls: string[] = [];
    const fetcher = (async (input: string | URL | Request) => {
      const url = String(input); urls.push(url);
      const second = url.includes("page=2");
      const items = Array.from({ length: second ? 1 : 100 }, (_, i) => ({ filename: `file-${second ? 100 : i}`, id: second ? 100 : i, head_sha: "actual", status: "completed", conclusion: "success" }));
      return new Response(JSON.stringify(url.includes("check-runs") ? { check_runs: items } : url.includes("/files?") ? items : { head: { sha: "head" }, state: "open" }));
    }) as typeof fetch;
    const gh = githubClient("o/r", "", fetcher);
    assert.equal((await gh.pullRequest(2)).changedFiles.length, 101);
    const checks = await gh.checksFor("head");
    assert.equal(checks.length, 101);
    assert.equal(checks[100].commitSha, "actual");
    assert.equal(urls.length, 5);
  });
  it("reports rate limits without leaking provider response bodies", async () => {
    for (const status of [403, 429]) {
      const fetcher = (async () => new Response("sensitive provider body", { status, headers: { "x-ratelimit-remaining": "0", "retry-after": "60" } })) as typeof fetch;
      await assert.rejects(githubClient("o/r", "", fetcher).checksFor("sha"), /GitHub rate limit.*retry-after=60/);
    }
  });
  it("fails on a later page instead of returning partial evidence", async () => {
    let n = 0;
    const fetcher = (async () => ++n === 1 ? new Response(JSON.stringify({ check_runs: Array(100).fill({}) })) : new Response("private", { status: 500 })) as typeof fetch;
    await assert.rejects(githubClient("o/r", "", fetcher).checksFor("sha"), /500/);
  });
});
