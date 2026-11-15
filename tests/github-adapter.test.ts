import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { githubClient, GitHubRequestError } from "../lib/adapters/github";

const fakeFetch = (body: unknown) => (async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;
const json = (body: unknown, headers?: Record<string, string>, status = 200) => new Response(JSON.stringify(body), { status, headers });
const pr = { title: "Scoped change", state: "open", head: { sha: "abc1234" }, changed_files: 101, html_url: "https://github.com/o/r/pull/2" };

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

  it("reads files and failing checks beyond the first 100 records", async () => {
    const urls: string[] = [];
    const gh = githubClient("o/r", "test-token", async (input) => {
      const url = String(input);
      urls.push(url);
      if (url.endsWith("/pulls/2")) return json(pr);
      if (url.includes("/files")) return url.includes("page=2")
        ? json([{ filename: "lib/final-file.ts" }])
        : json(Array.from({ length: 100 }, (_, i) => ({ filename: `lib/file-${i}.ts` })), { link: '<https://api.github.com/repos/o/r/pulls/2/files?per_page=100&page=2>; rel="next"' });
      return url.includes("page=2")
        ? json({ check_runs: [{ id: 101, name: "security", status: "completed", conclusion: "failure", head_sha: "abc1234" }] })
        : json({ check_runs: Array.from({ length: 100 }, (_, i) => ({ id: i, name: `check-${i}`, status: "completed", conclusion: "success", head_sha: "abc1234" })) }, { link: '<https://api.github.com/repos/o/r/commits/abc1234/check-runs?per_page=100&page=2>; rel="next"' });
    });
    const record = await gh.pullRequest(2);
    assert.equal(record.changedFiles.length, 101);
    assert.equal(record.changedFiles.at(-1), "lib/final-file.ts");
    const checks = await gh.checksFor("abc1234");
    assert.equal(checks.length, 101);
    assert.equal(checks.at(-1)?.conclusion, "failure");
    assert.equal(urls.length, 5);
  });

  it("rejects incomplete PR files and a failed later page instead of returning partial evidence", async () => {
    const incomplete = githubClient("o/r", undefined, async (input) => String(input).endsWith("/pulls/2") ? json(pr) : json([]));
    await assert.rejects(() => incomplete.pullRequest(2), /file evidence is incomplete/);
    let calls = 0;
    const failedPage = githubClient("o/r", undefined, async () => ++calls === 1
      ? json({ check_runs: [{ id: 1 }] }, { link: '<https://api.github.com/repos/o/r/commits/abc1234/check-runs?per_page=100&page=2>; rel="next"' })
      : json({}, {}, 503));
    await assert.rejects(() => failedPage.checksFor("abc1234"), /503/);
  });

  it("never forwards credentials through cross-host, cross-repository, or looping pagination", async () => {
    for (const next of [
      "https://example.com/repos/o/r/commits/abc1234/check-runs?page=2",
      "https://api.github.com/repos/other/repo/commits/abc1234/check-runs?page=2",
      "https://api.github.com/repos/o/r/commits/abc1234/check-runs?per_page=100",
    ]) {
      let requests = 0;
      const gh = githubClient("o/r", "secret-test-token", async () => {
        requests++;
        return json({ check_runs: [] }, { link: `<${next}>; rel="next"` });
      });
      await assert.rejects(() => gh.checksFor("abc1234"), /unsafe or repeated pagination/);
      assert.equal(requests, 1);
    }
  });

  it("reports primary and secondary limits without echoing provider bodies or retrying", async () => {
    const responses: Array<{ status: number; headers: Record<string, string> }> = [
      { status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1794730800" } },
      { status: 429, headers: { "retry-after": "60" } },
      { status: 403, headers: {} },
    ];
    for (const response of responses) {
      let requests = 0;
      const gh = githubClient("o/r", "secret-test-token", async () => {
        requests++;
        return json({ message: "Secondary rate limit: private account detail" }, response.headers, response.status);
      });
      await assert.rejects(() => gh.checksFor("abc1234"), (error: unknown) => {
        assert.ok(error instanceof GitHubRequestError);
        assert.equal(error.rateLimited, true);
        assert.equal(error.status, response.status);
        if (response.status === 429) assert.equal(error.retryAfterSeconds, 60);
        if ("x-ratelimit-reset" in response.headers) assert.equal(error.rateLimitReset, "2026-11-15T08:20:00.000Z");
        assert.doesNotMatch(error.message, /secret-test-token|private account detail/);
        return true;
      });
      assert.equal(requests, 1);
    }
  });

  it("distinguishes permission errors from rate limits and preserves the check's actual SHA", async () => {
    const forbidden = githubClient("o/r", undefined, async () => json({ message: "Forbidden" }, {}, 403));
    await assert.rejects(() => forbidden.checksFor("abc1234"), (error: unknown) => error instanceof GitHubRequestError && !error.rateLimited);
    const gh = githubClient("o/r", undefined, fakeFetch({ check_runs: [{ id: 1, name: "old", head_sha: "def5678", status: "completed", conclusion: "success" }] }));
    assert.equal((await gh.checksFor("abc1234"))[0].commitSha, "def5678");
  });
});
