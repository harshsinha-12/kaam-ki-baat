// Three spatial zones (docs/spatial-live-context-v2.md):
//   LEFT  team_memory     — authorized teammates: approved decisions + escalation
//   CENTER leader_desk    — verified leader only: answer clarifications, approve decisions
//   RIGHT code_navigator  — repo-authorized teammates: exact SHA/file/function/lines/tests
// A head turn (AirPods / webcam) or a click only SELECTS a zone. Activation is a
// separate explicit act, and authorization is always decided server-side.

export const ZONES = ["team_memory", "leader_desk", "code_navigator"] as const;
export type Zone = (typeof ZONES)[number];
export const ZONE_POSITION: Record<Zone, "left" | "center" | "right"> = {
  team_memory: "left",
  leader_desk: "center",
  code_navigator: "right",
};

export const FOCUS_PROVIDERS = ["airpods", "webcam", "manual"] as const;
export type FocusProvider = (typeof FOCUS_PROVIDERS)[number];
// Explicit activation only. "head_turn" is deliberately NOT an activation method.
export const ACTIVATION_METHODS = ["tap", "click", "keyboard", "voice_command", "double_nod"] as const;
export type ActivationMethod = (typeof ACTIVATION_METHODS)[number];

export type Role = "member" | "leader";

export interface DeviceSession {
  sessionId: string;
  tokenHash: string;
  participantId: string;
  deviceLabel: string; // free text, e.g. "Asha's laptop" — no hardware IDs
  expiresAt: string;
}

export type DecisionState = "proposed" | "conditional" | "approved" | "disputed" | "superseded";

export interface SourceRef {
  kind: "wispr_meeting" | "leader_resolution" | "app_live_stt" | "github";
  id: string; // passage id, ticket id, utterance event id, or commit/PR ref
  label: string;
  meetingId?: string;
}

export interface Decision {
  id: string;
  topic: string;
  statement: string;
  conditions?: string;
  state: DecisionState;
  ownerId?: string;
  version: number; // per-decision version; increases on every approved change
  sources: SourceRef[];
  meetingId: string;
  approvedBy?: string;
  approvedAt?: string;
}

export type TicketState = "pending" | "answered" | "delivered" | "acknowledged" | "withdrawn";

export interface ClarificationTicket {
  id: string;
  requesterId: string;
  question: string; // minimal question only — never a transcript dump
  meetingId: string;
  contextRefs: SourceRef[];
  decisionId?: string; // decision this question is about, if any
  state: TicketState;
  createdAt: string;
  answer?: { decisionId: string; decisionVersion: number; statement: string; conditions?: string; approvedBy: string; approvedAt: string };
  leaderCall?: { status: "not_requested" | "unavailable" | "no_consent" | "requested"; at: string };
}

export interface LiveUtterance {
  eventId: string; // client-generated, globally unique per utterance revision
  utteranceId: string; // stable across provisional -> final revisions
  sessionId: string;
  participantId: string; // set by the server from the session, never the client
  seq: number; // per-session sequence for ordering / dedupe
  text: string;
  isFinal: boolean;
  speakerConfidence: number; // 0..1; < 0.6 = uncertain speaker
  language?: string;
  capturedAt: string; // device clock
  receivedAt: string; // server clock
  source: "app_live_stt";
  status: "provisional"; // live speech is never authoritative until reconciled
  visibility: "private" | "team";
}

export interface Consent {
  microphone: boolean;
  shareWithTeam: boolean;
  recordedAt: string;
  receiptId: string;
}
