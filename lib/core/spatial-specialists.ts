// Air Agents-inspired focus switching (github.com/ahmedfahim21/Spatial-Agents):
// each agent has a fixed place (azimuth), a visible status, and keeps its own
// context. Here the "place" is a card position in the UI. This is NOT
// head-tracked spatial audio — a phone call is mono.
export type Specialist = "code_scout" | "fix_navigator" | "evidence_verifier";
export type CardStatus = "idle" | "working" | "has_reply" | "needs_approval" | "error";

export interface FocusState {
  active: Specialist;
  taskId: string | null;
  contextVersion: number;
}

export const SPECIALISTS: Record<Specialist, { label: string; purpose: string; position: "left" | "center" | "right"; readOnly: true }> = {
  code_scout: { label: "Code Scout", purpose: "Find the relevant code, PRs and history at a pinned SHA", position: "left", readOnly: true },
  fix_navigator: { label: "Fix Navigator", purpose: "Exact file, function, test and next steps", position: "center", readOnly: true },
  evidence_verifier: { label: "Evidence Verifier", purpose: "What is actually merged, tested and saved", position: "right", readOnly: true },
};

export function chooseSpecialist(utterance: string, current: Specialist = "code_scout"): Specialist {
  const s = utterance.toLowerCase();
  if (/\b(where|which file|how do i fix|show me the code|which function|line|kahan|kis file|kaunsa function|open)\b/.test(s)) return "fix_navigator";
  if (/\b(proof|evidence|verified|tests? pass|passed|ci|is it done|done|merged|merge|source|really finished|saved|ho gaya)\b/.test(s)) return "evidence_verifier";
  if (/\b(find|what changed|what is left|what's left|pull request|pr|issue|search|what happened|kya bacha)\b/.test(s)) return "code_scout";
  return current;
}

/** Switching focus never drops the task or bumps the context version. */
export function switchFocus(state: FocusState, next: Specialist): FocusState {
  return { ...state, active: next };
}
