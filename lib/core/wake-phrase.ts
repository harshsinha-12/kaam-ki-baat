// Wake phrase for hands-free use: "Hey Wispr, code dikhao" or "Hey Kaam, freeze kab hai?"
//
// Kaam Ki Baat cannot change Wispr Flow itself (it is a closed desktop app with no
// public control API). What it can do is listen for its own wake phrase, only
// after the person turns it on, and accept commands from two inputs:
//   1. Live speech in the browser, after an explicit microphone permission.
//   2. Text that Wispr Flow dictates into the command field (Flow types wherever
//      the cursor is), so a Flow user never needs a second microphone at all.
//
// Everything here is pure and deterministic: the browser feeds transcript text
// in, this module decides whether the wake phrase was said and what followed it.
// No audio ever reaches this module, and nothing is sent anywhere before a wake.

export const DEFAULT_WAKE_WORDS = ["hey wispr", "hey kaam", "ok kaam"] as const;

/**
 * Common mishearings of the wake phrases by speech recognisers, mapped to the canonical form.
 *
 * The Kaam aliases are deliberately narrower than the Wispr ones, because their
 * parts are everyday Hindi and English: "kam" means "less", "है" means "is",
 * "he" is a common Hinglish spelling of "hai", and "hi, come" / "hey, calm down"
 * are ordinary English. So:
 *   - the short "kam" only counts after an explicit "hey/hay/hei/ok/okay";
 *   - "ae" (a real Hindi vocative) only counts before the long "kaam/khaam";
 *   - "he" and "hi" never wake Kaam, and "come" is not an alias;
 *   - "calm" is accepted after "hey", except in "calm down";
 *   - in Devanagari only "हे" wakes; "है काम" ("work is ...") is a sentence.
 */
const ALIASES: [RegExp, string][] = [
  [/\b(?:hey|hay|hei|he|ae|ey|hi)[\s,.!-]*(?:wispr|whisper|wisper|whispr|whispa|wispar|vispar|visper|wisp)\b/gi, "hey wispr"],
  [/(?:हे|ए)\s*(?:विस्पर|व्हिस्पर|विस्पर्)/g, "hey wispr"],
  [/\b(?:hey|hay|hei|ey)[\s,.!-]*(?:kaam|khaam|kam|kom)\b/gi, "hey kaam"],
  [/\b(?:hey|hay|hei)[\s,.!-]*calm\b(?![\s,.!-]*down\b)/gi, "hey kaam"],
  [/\bae[\s,.!-]*(?:kaam|khaam)\b/gi, "hey kaam"],
  [/हे\s*काम/g, "hey kaam"],
  [/\b(?:ok|okay|o\.?k\.?)[\s,.!-]*(?:kaam|kam|calm|kom)\b/gi, "ok kaam"],
];

export interface WakeMatch { woke: true; wakeWord: string; command: string; at: number }
export type WakeResult = WakeMatch | { woke: false };

export function normalizeWake(text: string): string {
  let s = ` ${text.normalize("NFC")} `;
  for (const [re, to] of ALIASES) s = s.replace(re, to);
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Finds the LAST wake phrase in a transcript and returns what was said after it.
 * The last one wins so "hey kaam… no wait, hey kaam, open the test" keeps only
 * the final request, the same way Kaam Ki Baat treats self-corrections.
 */
export function detectWake(transcript: string, wakeWords: readonly string[] = DEFAULT_WAKE_WORDS): WakeResult {
  const s = normalizeWake(transcript);
  const lower = s.toLowerCase();
  let best: { word: string; at: number } | null = null;
  for (const raw of wakeWords) {
    const word = raw.toLowerCase().trim();
    if (!word) continue;
    let from = 0;
    for (;;) {
      const at = lower.indexOf(word, from);
      if (at < 0) break;
      const before = at === 0 ? " " : lower[at - 1];
      const after = lower[at + word.length] ?? " ";
      if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after) && (!best || at > best.at)) best = { word, at };
      from = at + 1;
    }
  }
  if (!best) return { woke: false };
  const command = s.slice(best.at + best.word.length).replace(/^[\s,.:;!?-]+/, "").trim();
  return { woke: true, wakeWord: best.word, command, at: best.at };
}

/*
 * Listening state machine. The UI holds one of these per tab.
 *   off       nothing is listening; the default, and where "stop" always returns
 *   asking    waiting for the browser permission prompt
 *   armed     permission granted; transcripts are checked for the wake phrase only
 *   awake     wake phrase heard; the next words (up to windowMs) are the command
 *   blocked   permission refused or no recogniser; never retries on its own
 */
export type ListenState = "off" | "asking" | "armed" | "awake" | "blocked";
export interface Listener { state: ListenState; awakeSince?: number; pending?: string; reason?: string }
export type ListenEvent =
  | { type: "enable" }
  | { type: "granted" }
  | { type: "denied"; reason: string }
  | { type: "disable" }
  | { type: "transcript"; text: string; final: boolean; now: number }
  | { type: "tick"; now: number }
  | { type: "typed"; text: string; now: number };

export interface Step { next: Listener; command?: string }

export const AWAKE_WINDOW_MS = 8000;

export function listen(cur: Listener, e: ListenEvent, wakeWords: readonly string[] = DEFAULT_WAKE_WORDS, windowMs = AWAKE_WINDOW_MS): Step {
  switch (e.type) {
    case "enable": return { next: cur.state === "off" || cur.state === "blocked" ? { state: "asking" } : cur };
    case "granted": return { next: cur.state === "asking" ? { state: "armed" } : cur };
    case "denied": return { next: { state: "blocked", reason: e.reason } };
    case "disable": return { next: { state: "off" } };
    case "tick":
      return cur.state === "awake" && cur.awakeSince !== undefined && e.now - cur.awakeSince > windowMs ? { next: { state: "armed" } } : { next: cur };
    case "typed": {
      // Dictated by Wispr Flow (or typed). A wake phrase is optional here: the
      // person already chose this field, so the whole line is the command.
      const w = detectWake(e.text, wakeWords);
      const command = (w.woke ? w.command : e.text).trim();
      return { next: cur, command: command || undefined };
    }
    case "transcript": {
      if (cur.state !== "armed" && cur.state !== "awake") return { next: cur };
      // A delayed transcript may arrive before the next periodic tick.
      // Expire the old wake window before interpreting any new speech.
      if (cur.state === "awake" && cur.awakeSince !== undefined && e.now - cur.awakeSince > windowMs) {
        return listen({ state: "armed" }, e, wakeWords, windowMs);
      }
      const w = detectWake(e.text, wakeWords);
      if (cur.state === "armed") {
        if (!w.woke) return { next: cur };
        if (e.final && w.command) return { next: { state: "armed" }, command: w.command };
        return { next: { state: "awake", awakeSince: e.now, pending: w.command } };
      }
      // awake: the recogniser may restart its transcript after the wake word.
      const said = (w.woke ? w.command : e.text).trim();
      if (e.final) return said ? { next: { state: "armed" }, command: said } : { next: { ...cur, pending: "" } };
      return { next: { ...cur, pending: said } };
    }
  }
}
