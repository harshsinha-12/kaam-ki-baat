> Planning reference adapted from the user-supplied handoff on 2026-11-15. Project naming has been updated. This is design intent, not implemented behavior. Current user instructions and [the active plan](../plan.md) take precedence.

# Data contracts and status semantics

## Records

```ts
type EvidenceRef = {
  id: string;
  kind: 'meeting_span' | 'github_issue' | 'github_pr' | 'github_commit' | 'github_file' | 'github_check';
  url?: string;                    // permission-safe share/deep link
  repository?: string; commitSha?: string; path?: string;
  meetingId?: string; speaker?: string; excerpt?: string;
  observedAt: string;              // ISO time
  visibility: 'private' | 'participant' | 'team';
};

type WorkItem = {
  id: string; title: string;
  ownerId?: string;
  assignmentStatus: 'mentioned' | 'proposed' | 'accepted' | 'disputed' | 'unknown';
  executionStatus: 'not_started' | 'in_progress' | 'blocked' | 'reported_done' | 'verified_done';
  evidenceIds: string[];
  updatedAt: string;
};

type GithubState = {
  repo: string; prNumber?: number; prState?: 'open' | 'closed_unmerged' | 'merged';
  checkedCommitSha?: string; ci?: 'not_run' | 'pending' | 'passed' | 'failed' | 'unknown';
};

type CallRecord = {
  bolnaExecutionId: string; participantId: string;
  consentRecorded: boolean; durationSeconds?: number;
  agentVersion: string; sourceSnapshotId: string;
  nextActionId?: string; observedFailures: string[];
};
```

## Required tools (internal backend contracts)

- `get_my_brief({participant_id, project_id})` -> 2–3 sentences, evidence_ref_ids, pending_actions. `participant_id` must be verified server-side, not blindly trusted from LLM args.
- `get_task_evidence({task_id, detail_level})` -> access-filtered meeting quote + issue/PR/file/check references, with checked SHA and freshness.
- `get_changes({participant_id, since})` -> changed, newly confirmed and invalidated items; no old state without clear label.
- `record_task_update({task_id, intended_status, actor_id, confirmation, idempotency_key})` -> persisted id + state read-back; reject ambiguous ownership/unauthorized actors.

## Invariants
- "Discussed" does not equal "assigned". "Assigned" does not equal "accepted". "PR exists" does not equal "merged". "CI passed" does not equal "feature works in production".
- No output can cite a file without the exact pinned SHA; unstable branch links may be added only as convenience links.
- Every answer about work completion includes evidence freshness.
- Tools cannot reveal private meeting data to a caller who did not consent to its use and lacks permission.
- Tool success messages are generated from actual stored responses, never from the LLM's guess.
