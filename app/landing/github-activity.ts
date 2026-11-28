// Public GitHub contributions for harshsinha-12, fetched 2026-11-28 from
// contributionsCollection (startedAt 2025-11-23, endedAt 2026-11-28).
// Restricted/private contributions (193) are not included: GitHub does not
// split them across these four buckets, and the public split is what the
// profile activity chart shows.

export const GITHUB_ACTIVITY = {
  login: "harshsinha-12",
  profile: "https://github.com/harshsinha-12",
  from: "2025-11-23",
  to: "2026-11-28",
  commits: 943,
  codeReview: 9,
  pullRequests: 118,
  issues: 2,
} as const;

export type ActivityKey = "commits" | "codeReview" | "pullRequests" | "issues";

export function activityPercents(counts: Record<ActivityKey, number>): Record<ActivityKey, number> & { total: number } {
  const total = counts.commits + counts.codeReview + counts.pullRequests + counts.issues;
  const round = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 100));
  return {
    total,
    commits: round(counts.commits),
    codeReview: round(counts.codeReview),
    pullRequests: round(counts.pullRequests),
    issues: round(counts.issues),
  };
}
