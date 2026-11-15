// Shared data contracts. Pure TypeScript, no runtime dependencies, so the
// domain core runs and tests anywhere (Node + tsx). Validate at the HTTP edge
// with the hand-written guards in lib/validate.ts.
//
// Evidence is SOURCE DATA, never instructions. Every code/check claim is pinned
// to a commit SHA. Status vocabulary follows docs/architecture.md §5.

export type SourceLabel = "LIVE" | "FIXTURE";

export type OwnershipState = "mentioned" | "proposed" | "accepted" | "disputed" | "unknown";
export type PrState = "none" | "open" | "closed_unmerged" | "merged";
export type CheckConclusion = "success" | "failure" | "pending" | "cancelled";
export type CheckState = "not_run" | "pending" | "passed" | "failed" | "stale";
export type CompletionStatus = "not_started" | "in_progress" | "blocked" | "reported_done";

export interface MeetingRecord {
  id: string; // Wispr meeting ID
  title: string;
  date?: string;
  source: SourceLabel; // LIVE = read through Wispr MCP for an approved meeting
  approvedBy: string; // who approved this meeting for the project
  sourceVersion?: string; // provider modification timestamp or immutable source hash
  sourceCreatedAt?: string; // provider record creation time, not an assumed meeting date
  fetchedAt?: string;
  transcriptHash?: string; // source transcript hash; full transcript stays private
}

export interface MeetingPassage {
  kind: "meeting";
  id: string;
  meetingId: string;
  speaker?: string;
  charStart: number;
  charEnd: number;
  text: string;
  visibility: "participant" | "team";
  textHash?: string;
}

export interface RepoFile {
  path: string;
  content: string; // file content at snapshot.pinnedSha
}

export interface PullRequestRecord {
  kind: "pr";
  id: string;
  repository: string;
  number: number;
  title: string;
  state: Exclude<PrState, "none">;
  headSha: string;
  mergedSha?: string;
  changedFiles: string[];
  url: string;
}

export interface CheckRecord {
  kind: "check";
  id: string;
  repository: string;
  commitSha: string;
  name: string;
  conclusion: CheckConclusion;
  url?: string;
}

export interface CodeFinding {
  kind: "code";
  id: string;
  repository: string;
  commitSha: string;
  path: string;
  lineStart: number;
  lineEnd: number;
  symbol?: string;
  excerpt: string;
  // confirmed = file is changed by the task's PR AND matches; otherwise candidate.
  match: "candidate" | "confirmed";
  url: string;
  retrieval?: {
    method: "graphify";
    builtAt: string;
    // Graph relationships suggest context; they do not prove task ownership or completion.
    via?: { symbol: string; relation: string; confidence: "EXTRACTED" | "INFERRED"; direction: "outgoing" | "incoming" };
  };
}

export interface Task {
  id: string;
  title: string;
  meetingId: string;
  passageIds: string[];
  assignment: { state: OwnershipState; ownerId?: string };
  prNumber?: number;
  searchTerms: string[]; // deterministic seeds for Code Scout
}

export interface Participant {
  id: string;
  name: string;
  // Server-owned authorization. Never accepted from a client or a model.
  role?: "member" | "leader"; // default member
  repoAccess?: boolean; // may use the Code Navigator (default true)
  meetingIds: string[]; // meetings this person may hear about
  taskIds: string[]; // tasks this person may read/update
}

export interface EvidenceSnapshot {
  label: SourceLabel;
  note?: string;
  repository: string; // owner/name
  pinnedSha: string;
  fetchedAt: string;
  meetings: MeetingRecord[];
  passages: MeetingPassage[];
  files: RepoFile[];
  pullRequests: PullRequestRecord[];
  checks: CheckRecord[];
  tasks: Task[];
  participants: Participant[];
  codeGraph?: import("./evidence/code-graph").CodeGraph;
}

export interface TaskUpdateRequest {
  taskId: string;
  intendedStatus: CompletionStatus;
  confirmation: true;
  idempotencyKey: string;
}
