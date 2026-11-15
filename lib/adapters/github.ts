import type { CheckRecord, PullRequestRecord } from "../contracts";

// Read-only GitHub REST adapter for ONE authorized repository.
// Token is optional for public repos (GITHUB_TOKEN raises rate limits).

export interface GitHubClient {
  pullRequest(number: number): Promise<PullRequestRecord>;
  checksFor(sha: string): Promise<CheckRecord[]>;
}

export function githubClient(repository: string, token = process.env.GITHUB_TOKEN, fetchImpl: typeof fetch = fetch): GitHubClient {
  if (!/^[^/]+\/[^/]+$/.test(repository)) throw new Error("repository must be owner/name");
  const get = async (p: string) => {
    const res = await fetchImpl(`https://api.github.com/repos/${repository}${p}`, {
      headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    if (!res.ok) {
      const limited = res.status === 429 || (res.status === 403 && (res.headers.get("x-ratelimit-remaining") === "0" || res.headers.has("retry-after")));
      throw new Error(limited
        ? `GitHub rate limit (${res.status}); retry-after=${res.headers.get("retry-after") ?? "unknown"}; reset=${res.headers.get("x-ratelimit-reset") ?? "unknown"}`
        : `GitHub ${p} -> ${res.status}`);
    }
    return res.json() as Promise<any>;
  };
  // Numbered pages keep credentials on the authorized repository's API origin.
  const pages = async (p: string, field?: string): Promise<any[]> => {
    const result: any[] = [];
    for (let page = 1; ; page++) {
      const data = await get(`${p}?per_page=100&page=${page}`);
      const items = field ? data[field] : data;
      if (!Array.isArray(items)) throw new Error("Invalid GitHub page");
      result.push(...items);
      if (items.length < 100) return result;
    }
  };
  return {
    async pullRequest(number) {
      const pr = await get(`/pulls/${number}`);
      const files = await pages(`/pulls/${number}/files`);
      return {
        kind: "pr",
        id: `pr:${number}`,
        repository,
        number,
        title: pr.title,
        state: pr.merged_at ? "merged" : pr.state === "open" ? "open" : "closed_unmerged",
        headSha: pr.head.sha,
        mergedSha: pr.merge_commit_sha && pr.merged_at ? pr.merge_commit_sha : undefined,
        changedFiles: files.map((f) => f.filename),
        url: pr.html_url,
      };
    },
    async checksFor(sha) {
      const runs = await pages(`/commits/${sha}/check-runs`, "check_runs");
      // skipped / neutral runs carry no verdict about the code: drop them rather than call them failures.
      return runs.filter((c) => !(c.status === "completed" && ["skipped", "neutral"].includes(c.conclusion))).map((c) => ({
        kind: "check" as const,
        id: `check:${c.id}`,
        repository,
        commitSha: c.head_sha ?? sha,
        name: c.name,
        conclusion: c.status !== "completed" ? "pending" : c.conclusion === "success" ? "success" : c.conclusion === "cancelled" ? "cancelled" : "failure", // failure | timed_out | action_required
        url: c.html_url,
      }));
    },
  };
}
