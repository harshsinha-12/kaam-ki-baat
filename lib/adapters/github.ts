import type { CheckRecord, PullRequestRecord } from "../contracts";

// Read-only GitHub REST adapter for ONE authorized repository.
// Token is optional for public repos (GITHUB_TOKEN raises rate limits).

export interface GitHubClient {
  pullRequest(number: number): Promise<PullRequestRecord>;
  checksFor(sha: string): Promise<CheckRecord[]>;
}

export class GitHubRequestError extends Error {
  constructor(
    readonly status: number,
    readonly rateLimited: boolean,
    readonly retryAfterSeconds?: number,
    readonly rateLimitReset?: string,
  ) {
    super(rateLimited
      ? `GitHub rate limit (${status})${retryAfterSeconds != null ? `; retry after ${retryAfterSeconds}s` : ""}${rateLimitReset ? `; resets at ${rateLimitReset}` : ""}`
      : `GitHub request failed (${status}); check repository access and credentials`);
    this.name = "GitHubRequestError";
  }
}

export function githubClient(repository: string, token = process.env.GITHUB_TOKEN, fetchImpl: typeof fetch = fetch): GitHubClient {
  if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(repository) || [".", ".."].includes(repository.split("/")[1])) throw new Error("repository must be owner/name");
  const base = `https://api.github.com/repos/${repository}`;
  const get = async (url: string) => {
    const res = await fetchImpl(url, {
      headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      // Only inspect the message to classify secondary limits. Never echo the
      // provider body, which may contain private repository/account details.
      const body = await res.json().catch(() => ({})) as { message?: string };
      const retry = res.headers.get("retry-after");
      const reset = res.headers.get("x-ratelimit-reset");
      const rateLimited = res.status === 429 || (res.status === 403 && (
        res.headers.get("x-ratelimit-remaining") === "0" || retry != null || (typeof body?.message === "string" && /rate limit/i.test(body.message))
      ));
      const retryAfter = retry != null && /^\d+$/.test(retry) ? Number(retry) : undefined;
      const resetMs = reset != null && /^\d+$/.test(reset) ? Number(reset) * 1000 : NaN;
      const resetAt = Number.isFinite(resetMs) && !Number.isNaN(new Date(resetMs).getTime()) ? new Date(resetMs).toISOString() : undefined;
      throw new GitHubRequestError(res.status, rateLimited, rateLimited ? retryAfter : undefined, rateLimited ? resetAt : undefined);
    }
    return { body: await res.json() as any, link: res.headers.get("link") };
  };
  const pages = async <T>(endpoint: string, select: (body: any) => T[]): Promise<T[]> => {
    const resource = `${base}${endpoint}`;
    let url: string | undefined = `${resource}?per_page=100`;
    const seen = new Set<string>();
    const records: T[] = [];
    while (url) {
      // Follow pagination only within this exact resource. Never send the
      // token to a different host, repository, PR, or commit from a Link header.
      const parsed = new URL(url);
      if (parsed.origin !== "https://api.github.com" || parsed.pathname !== new URL(resource).pathname || parsed.username || parsed.password || seen.has(url)) {
        throw new Error("GitHub returned unsafe or repeated pagination; evidence is incomplete");
      }
      seen.add(url);
      const { body, link } = await get(url);
      const items = select(body);
      if (!Array.isArray(items)) throw new Error("GitHub returned invalid paginated evidence");
      records.push(...items);
      url = link?.match(/<([^>]+)>;\s*rel="next"/)?.[1];
    }
    return records;
  };
  return {
    async pullRequest(number) {
      if (!Number.isSafeInteger(number) || number < 1) throw new Error("PR number must be a positive integer");
      const { body: pr } = await get(`${base}/pulls/${number}`);
      const files = await pages<{ filename: string }>(`/pulls/${number}/files`, (body) => body);
      // GitHub caps the files endpoint at 3,000. An incomplete list must not
      // become a snapshot that silently misses the relevant code.
      if (typeof pr.changed_files === "number" && files.length !== pr.changed_files) {
        throw new Error(`GitHub PR #${number} file evidence is incomplete (${files.length}/${pr.changed_files})`);
      }
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
      if (!/^[a-fA-F0-9]{7,40}$/.test(sha)) throw new Error("checks require a commit SHA");
      const checks = await pages<any>(`/commits/${sha}/check-runs`, (body) => body.check_runs);
      // skipped / neutral runs carry no verdict about the code: drop them rather than call them failures.
      return checks.filter((c) => !(c.status === "completed" && ["skipped", "neutral"].includes(c.conclusion))).map((c) => ({
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
