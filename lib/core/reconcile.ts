import type { CheckRecord, CheckState, OwnershipState, PrState, PullRequestRecord, Task } from "../contracts";

// Deterministic status rules. The ONLY place status is decided. No LLM here.
export interface Reconciled {
  taskId: string;
  ownership: OwnershipState;
  acceptedOwnerId: string | null;
  pr: PrState;
  prNumber: number | null;
  currentSha: string | null; // head SHA for open PRs, merged SHA for merged PRs
  checks: CheckState;
  checkShaSeen: string | null; // SHA the latest available check ran on
  productionVerified: false; // never derivable from CI
  warnings: string[];
}

export function reconcileTask(task: Task, prs: PullRequestRecord[], checks: CheckRecord[]): Reconciled {
  const warnings: string[] = [];
  const pr = task.prNumber != null ? prs.find((p) => p.number === task.prNumber) : undefined;
  if (task.prNumber != null && !pr) warnings.push(`PR #${task.prNumber} is referenced but was not found in the snapshot`);

  const acceptedOwnerId = task.assignment.state === "accepted" ? task.assignment.ownerId ?? null : null;
  if (task.assignment.state === "accepted" && !acceptedOwnerId) warnings.push("accepted ownership has no confirmed person");
  if (task.assignment.state === "mentioned") warnings.push("owner was only mentioned, not assigned");
  if (task.assignment.state === "proposed") warnings.push("owner was proposed but has not accepted");
  if (task.assignment.state === "disputed") warnings.push("ownership is disputed");

  const prState: PrState = pr ? pr.state : "none";
  if (pr?.state === "open") warnings.push(`PR #${pr.number} is open, not merged`);
  if (pr?.state === "merged" && !pr.mergedSha) warnings.push("merged PR has no merged commit SHA");
  const currentSha = pr ? (pr.state === "merged" ? pr.mergedSha ?? null : pr.headSha) : null;

  let checkState: CheckState = "not_run";
  let checkShaSeen: string | null = null;
  if (pr) {
    const related = checks.filter((c) => c.repository === pr.repository);
    const onCurrent = currentSha ? related.filter((c) => c.commitSha === currentSha) : [];
    if (onCurrent.length) {
      checkShaSeen = currentSha;
      checkState = onCurrent.some((c) => c.conclusion === "failure" || c.conclusion === "cancelled")
        ? "failed"
        : onCurrent.every((c) => c.conclusion === "success")
          ? "passed"
          : "pending";
    } else if (related.length) {
      checkShaSeen = related[related.length - 1].commitSha;
      checkState = "stale";
      warnings.push(`latest check ran on ${short(checkShaSeen)}, not the current ${short(currentSha)}`);
    }
  }

  return {
    taskId: task.id,
    ownership: task.assignment.state,
    acceptedOwnerId,
    pr: prState,
    prNumber: pr?.number ?? null,
    currentSha,
    checks: checkState,
    checkShaSeen,
    productionVerified: false,
    warnings,
  };
}

export function short(sha: string | null | undefined): string {
  return sha ? sha.slice(0, 7) : "unknown";
}
