import type { MeetingPassage } from "../contracts";
import type { Specialist } from "../core/spatial-specialists";

export const SPACES = ["meeting", "agent", "code"] as const;
export type Space = typeof SPACES[number];
export type BrowserAction =
  | { type: "focus_space"; target: Space }
  | { type: "focus_specialist"; target: Specialist }
  | { type: "focus_evidence"; target: string }
  | { type: "scroll_page"; target: "up" | "down" };
export type ActionReceipt = { ok: boolean; message: string };
export type PendingAction = { id: string; action: BrowserAction; expiresAt: number };
export interface PageState {
  space: Space;
  selectedEvidence: string | null;
  visibleTargets: string[];
}
export interface SpatialContext {
  callId: string;
  snapshot: { label: string; repository: string; pinnedSha: string; fetchedAt: string };
  page: PageState;
  connected: boolean;
  task: { id: string; title: string; ownership: string } | null;
  meetings: { id: string; title: string; source: string; passages: MeetingPassage[] }[];
  cards: { id: Specialist; label: string; summary: string; evidence: { id: string; label: string; url?: string; match?: string }[] }[];
  turns: { at: string; utterance: string; specialist: string; spoken: string }[];
  outstanding: { id: string; fact: string; attempts: number }[];
  targets: { id: string; label: string; space: Space }[];
}

export function parseAction(value: unknown): BrowserAction | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const a = value as Record<string, unknown>;
  if (Object.keys(a).some(k => k !== "type" && k !== "target")) return null;
  if (a.type === "focus_space" && SPACES.includes(a.target as Space)) return a as BrowserAction;
  if (a.type === "focus_specialist" && ["code_scout", "fix_navigator", "evidence_verifier"].includes(String(a.target))) return a as BrowserAction;
  if (a.type === "scroll_page" && (a.target === "up" || a.target === "down")) return a as BrowserAction;
  if (a.type === "focus_evidence" && typeof a.target === "string" && a.target.length > 0 && a.target.length <= 300) return a as BrowserAction;
  return null;
}

// Only source links for the authorized repository are rendered. Never accept a
// model-supplied URL or execute JavaScript/HTML from evidence.
export function evidenceUrl(value: string | undefined, repository: string): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    return u.protocol === "https:" && u.hostname === "github.com" && !u.username && !u.password &&
      u.pathname.startsWith(`/${repository}/`) ? u.href : null;
  } catch { return null; }
}
