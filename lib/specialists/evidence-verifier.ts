import type { EvidenceSnapshot, Task } from "../contracts";
import { reconcileTask, short, type Reconciled } from "../core/reconcile";
import type { SavedUpdate } from "../core/persist-update";

// Agent C — Evidence Verifier: what is genuinely supported. Deterministic.

export interface Verdict {
  reconciled: Reconciled;
  lastSavedUpdate: SavedUpdate | null;
  canSayDone: boolean; // only true with merged PR + passing check on the merged SHA
  statements: string[]; // short, speakable, each one evidence-backed
}

export function evidenceVerifier(snapshot: EvidenceSnapshot, task: Task, lastSavedUpdate: SavedUpdate | null): Verdict {
  const r = reconcileTask(task, snapshot.pullRequests, snapshot.checks);
  const s: string[] = [];
  if (r.pr === "none") s.push("There's no pull request linked to this yet.");
  if (r.pr === "open") s.push(`PR #${r.prNumber} exists but it's still open, not merged.`);
  if (r.pr === "closed_unmerged") s.push(`PR #${r.prNumber} was closed without merging.`);
  if (r.pr === "merged") s.push(`PR #${r.prNumber} is merged at ${short(r.currentSha)}.`);

  if (r.checks === "passed") s.push(`Checks passed on the current commit ${short(r.currentSha)}. That's CI, not proof it works in production.`);
  if (r.checks === "failed") s.push(`Checks failed on the current commit ${short(r.currentSha)}.`);
  if (r.checks === "pending") s.push(`Checks are still running on ${short(r.currentSha)}.`);
  if (r.checks === "stale") s.push(`The last check result is for an older commit, ${short(r.checkShaSeen)}, so it doesn't verify the current code.`);
  if (r.checks === "not_run" && r.pr !== "none") s.push("No CI result exists for this commit.");

  if (r.ownership !== "accepted") s.push(ownershipLine(r.ownership));
  if (lastSavedUpdate) s.push(`Last saved update: ${lastSavedUpdate.status.replace("_", " ")} (record ${lastSavedUpdate.id}).`);

  const canSayDone = r.pr === "merged" && r.checks === "passed";
  return { reconciled: r, lastSavedUpdate, canSayDone, statements: s };
}

function ownershipLine(state: Reconciled["ownership"]): string {
  switch (state) {
    case "mentioned": return "Your name came up, but nobody actually assigned this.";
    case "proposed": return "This was proposed for you; you haven't accepted it yet.";
    case "disputed": return "Ownership of this is disputed.";
    default: return "Ownership isn't established.";
  }
}
