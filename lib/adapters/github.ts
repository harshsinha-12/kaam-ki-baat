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
    if (!res.ok) throw new Error(`GitHub ${p} -> ${res.status}`);
    return res.json() as Promise<any>;
  };
  return {
    async pullRequest(number) {
      const pr = await get(`/pulls/${number}`);
      const files: any[] = await get(`/pulls/${number}/files?per_page=100`);
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
      const data = await get(`/commits/${sha}/check-runs?per_page=100`);
      // skipped / neutral runs carry no verdict about the code: drop them rather than call them failures.
      return (data.check_runs as any[]).filter((c) => !(c.status === "completed" && ["skipped", "neutral"].includes(c.conclusion))).map((c) => ({
        kind: "check" as const,
        id: `check:${c.id}`,
        repository,
        commitSha: sha,
        name: c.name,
        conclusion: c.status !== "completed" ? "pending" : c.conclusion === "success" ? "success" : c.conclusion === "cancelled" ? "cancelled" : "failure", // failure | timed_out | action_required
        url: c.html_url,
      }));
    },
  };
}
