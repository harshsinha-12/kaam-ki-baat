// What did the caller actually mean? Bolna gives us the transcript; this turns
// "umm, code freeze 3:30, nahi matlab, final time kya hai?" into a clean
// question, shows every edit it made (like Wispr Flow's "Correction identified"),
// resolves "woh / it / that" to the task in focus, and picks the agent.
// Deterministic and explainable — no model call.

export type Intent = "memory" | "code" | "verify" | "update" | "escalate" | "brief";
export interface Edit { kind: "filler" | "correction" | "repetition" | "resolved"; text: string; to?: string }
export interface Understood { heard: string; cleaned: string; normalized: string; edits: Edit[]; intent: Intent; why: string }

const FILLERS = /\b(umm+|um+|uh+|hmm+|haan+ toh|toh|like|basically|actually|matlab ki|you know|i mean ki)\b[,]?\s*/gi;
const CORRECTION = /\b(no wait|nahi,? matlab|nahi nahi|sorry,? i mean|i mean|matlab|no sorry|scratch that|correction)\b/i;

// Hinglish → plain intent words (kept small and inspectable)
const LEXICON: [RegExp, string][] = [
  [/\bkahan( hai)?\b/gi, "where is"], [/\bkis file\b/gi, "which file"], [/\bkaunsa function\b/gi, "which function"],
  [/\bkab( hai)?\b/gi, "when is"], [/\bkaun\b/gi, "who"], [/\bkya decide hua\b/gi, "what was decided"],
  [/\bho gaya\b/gi, "is it done"], [/\bmerge hua\b/gi, "is it merged"], [/\bmera kaam\b/gi, "my task"],
  [/\bbug wala\b/gi, "the bug"], [/\bkar do\b/gi, "please set"], [/\bpuchho\b/gi, "ask"],
];

export function understand(raw: string, ctx: { focusTaskTitle?: string } = {}): Understood {
  const heard = raw.trim();
  const edits: Edit[] = [];
  let s = heard;

  // 1. fillers (tagged before anything else, so none hide inside a correction)
  s = s.replace(FILLERS, (m) => { edits.push({ kind: "filler", text: m.trim().replace(/,$/, "") }); return ""; });
  // 2. self-correction: keep only what follows the last correction marker
  const parts = s.split(CORRECTION);
  if (parts.length > 1) {
    const kept = parts[parts.length - 1].replace(/^[\s,.\-—–]+/, "").trim();
    const dropped = parts.slice(0, -1).join(" ").replace(/[\s,]+$/, "").trim();
    if (kept.length >= 4) { edits.push({ kind: "correction", text: dropped, to: kept }); s = kept; }
  }
  // 3. immediate repetitions ("the the", "code code")
  s = s.replace(/\b(\w+)(\s+\1\b)+/gi, (m, w) => { edits.push({ kind: "repetition", text: m }); return w; });
  const cleaned = s.replace(/\s{2,}/g, " ").replace(/^[,\s]+/, "").trim();

  // 4. Hinglish → intent words; resolve pronouns to the task in focus
  let normalized = cleaned;
  for (const [re, to] of LEXICON) normalized = normalized.replace(re, to);
  if (ctx.focusTaskTitle && /\b(woh|wo|yeh|ye|that one|usko|isko)\b/i.test(cleaned) && !/\bthe bug\b/i.test(normalized)) {
    edits.push({ kind: "resolved", text: "woh / it", to: ctx.focusTaskTitle });
    normalized = `${normalized} (${ctx.focusTaskTitle})`;
  }

  // "code freeze" is a team decision, not a place in the code.
  const n = normalized.toLowerCase().replace(/\bcode[- ]freeze\b/g, "freeze");
  let intent: Intent = "memory", why = "a question about what the team decided";
  if (/\b(escalate)\b|\bask\b.*\b(leader|lead|charan)\b|\b(leader|lead|charan)\b.*\bask\b/.test(n)) { intent = "escalate"; why = "asked to send it to the leader"; }
  else if (/\b(please set|mark|in progress|blocked|done kar)\b/.test(n)) { intent = "update"; why = "asked to change a task status"; }
  else if (/\b(where is|which file|which function|code|line|function|bug)\b/.test(n)) { intent = "code"; why = "asked where something is in the code"; }
  else if (/\b(merged|ci|tests? pass|is it done|checks?)\b/.test(n)) { intent = "verify"; why = "asked whether work is merged or tested"; }
  else if (/\b(my task|what'?s left|brief|update)\b/.test(n)) { intent = "brief"; why = "asked for their own status"; }
  return { heard, cleaned, normalized, edits, intent, why };
}
