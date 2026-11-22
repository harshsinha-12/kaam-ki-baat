import { understand, type Understood } from "./understand";
import { detectWake } from "./wake-phrase";

// Turns one spoken or Wispr-dictated command into one workspace action.
//
// "Agentic computer use" here is deliberately scoped: the agent can drive the
// Kaam Ki Baat workspace (switch agents, search, open a file at a line, step
// through results, take and recall memory frames) through a fixed allowlist.
// It cannot press arbitrary buttons, type into other apps or touch the OS.
// Anything that writes or reaches another person needs an explicit "yes".

export type Zone = "team_memory" | "leader_desk" | "code_navigator";
export type Risk = "read" | "navigate" | "write";

export type Command =
  | { type: "switch_zone"; zone: Zone }
  | { type: "search_code"; query: string }
  | { type: "ask_memory"; question: string }
  | { type: "open_file"; path: string; line?: number }
  | { type: "step_result"; direction: 1 | -1 }
  | { type: "capture_frame"; note?: string }
  | { type: "recall"; query: string }
  | { type: "ask_lead"; question?: string }
  | { type: "stop_listening" }
  | { type: "not_allowed"; reason: string };

export interface Plan { command: Command; risk: Risk; needsConfirm: boolean; say: string; understood: Understood; why: string }

const ZONE_WORDS: [RegExp, Zone][] = [
  [/^(?:go |switch |move |jao |chalo )?(?:to )?(?:the )?(?:left|team memory|memory|baaye?n?|left (?:jao|side))(?: (?:jao|side|pe|par|kholo|open))?$/i, "team_memory"],
  [/^(?:go |switch |move |jao |chalo )?(?:to )?(?:the )?(?:right|code navigator|navigator|daaye?n?|right (?:jao|side))(?: (?:jao|side|pe|par|kholo|open))?$/i, "code_navigator"],
  [/^(?:go |switch |move |jao |chalo )?(?:to )?(?:the )?(?:front|centre|center|leader desk|lead desk|desk|saamne)(?: (?:jao|side|pe|par|kholo|open))?$/i, "leader_desk"],
];

const PATH = /([A-Za-z0-9_.@-]+(?:\/[A-Za-z0-9_.@-]+)+\.[A-Za-z0-9]{1,6}|[A-Za-z0-9_-]+\.(?:tsx?|jsx?|mjs|py|swift|go|rs|css|md|json))/;
const LINE = /\b(?:line|ln|lines|L)\s*(\d{1,6})\b/i;

const clean = (s: string) => s.replace(/[?.!,]+$/g, "").replace(/\s+/g, " ").trim();

export function planCommand(raw: string, ctx: { focusTaskTitle?: string } = {}): Plan {
  const woke = detectWake(raw);
  const understood = understand(woke.woke ? woke.command : raw, ctx);
  const text = clean(understood.cleaned);
  const n = text.toLowerCase();
  const plan = (command: Command, risk: Risk, say: string, why: string, needsConfirm = false): Plan => ({ command, risk, needsConfirm, say, understood, why });

  if (!n) return plan({ type: "not_allowed", reason: "empty" }, "read", "I didn't catch a command.", "nothing after the wake phrase");

  if (/^(?:stop|stop listening|bas|bas karo|chup|band karo|mic band|sleep|go to sleep|cancel)$/.test(n))
    return plan({ type: "stop_listening" }, "read", "Stopped listening. Turn it on again any time.", "asked to stop");

  for (const [re, zone] of ZONE_WORDS) if (re.test(n)) {
    const say = zone === "leader_desk" ? "Selecting the Leader Desk. Opening it still needs the lead's passkey." : zone === "team_memory" ? "Team Memory." : "Code Navigator.";
    return plan({ type: "switch_zone", zone }, "navigate", say, "named an agent");
  }

  if (/^(?:next|next one|agla|aage|neeche|down)(?: result| wala)?$/.test(n)) return plan({ type: "step_result", direction: 1 }, "navigate", "Next result.", "asked for the next result");
  if (/^(?:previous|prev|back|pichla|peeche|upar|up)(?: result| wala)?$/.test(n)) return plan({ type: "step_result", direction: -1 }, "navigate", "Previous result.", "asked for the previous result");

  // Photographic memory: take a frame of what is on screen, or recall one.
  if (/^(?:remember|save|snap|capture|freeze|yaad rakh(?:o|na)?|photo (?:le|lo|khinch)|screenshot)\b(?: (?:this|that|yeh|ye|view|screen|frame))*(?:\s+(?:as|because|for|kyunki)\s+(.+))?$/.test(n)) {
    const note = n.match(/\s(?:as|because|for|kyunki)\s+(.+)$/)?.[1];
    return plan({ type: "capture_frame", note }, "write", "Saved this view as a memory frame, and read it back.", "asked to remember the current view");
  }
  const recall = n.match(/^(?:recall|yaad (?:hai|karo|dilao)|what (?:was|were) (?:i|we) (?:looking at|seeing|reading)|kya dekh rah[ae] th[ae]|show (?:me )?(?:my )?(?:last|earlier|previous) (?:view|frame|screen)s?)\s*(?:when|about|for|jab|ke baare mein|regarding)?\s*(.*)$/);
  if (recall) return plan({ type: "recall", query: clean(recall[1] ?? "") }, "read", "Looking through your memory frames.", "asked what was on screen earlier");

  const ask = n.match(/^(?:ask|send (?:it |this )?to|escalate to)\s+(?:the )?(?:lead|leader|charan)\s*(?:about|ki|:)?\s*(.*)$/) ?? n.match(/^(?:lead|leader|charan) se (?:puchh?o|pooch(?:o|h lo))\s*(.*)$/);
  if (ask) return plan({ type: "ask_lead", question: clean(ask[1] ?? "") || undefined }, "write", "I'll send this to the lead. Say yes to confirm.", "asked to escalate", true);

  const open = text.match(/^(?:open|show|kholo|dikhao|go to)\s+(.+)$/i) ?? (PATH.test(text) ? [text, text] : null);
  if (open) {
    const path = open[1].match(PATH)?.[1];
    if (path) {
      const line = Number(open[1].match(LINE)?.[1] ?? NaN);
      return plan({ type: "open_file", path, line: Number.isFinite(line) ? line : undefined }, "navigate", `Opening ${path}${Number.isFinite(line) ? ` at line ${line}` : ""}.`, "named a file");
    }
  }

  // Free-form: let the existing intent rules pick the agent.
  if (understood.intent === "update") return plan({ type: "not_allowed", reason: "status changes are confirmed on a call" }, "write", "Status changes need a call with read-back, so I won't do that from here.", understood.why);
  if (understood.intent === "escalate") return plan({ type: "ask_lead", question: text }, "write", "I'll send this to the lead. Say yes to confirm.", understood.why, true);
  if (understood.intent === "code") return plan({ type: "search_code", query: text }, "read", "Searching the code.", understood.why);
  // Spoken "where do we…/which test…/how does X work" is a question about the code base.
  if (/^(?:where (?:do|does|is|are|did)|which (?:file|function|test|module)|how (?:does|do) (?:the |we )?\w+ (?:work|handle|check|save|store))\b/.test(n) || /\b(?:implemented|kahan likha|test covers)\b/.test(n))
    return plan({ type: "search_code", query: text }, "read", "Searching the code.", "asked where something lives");
  return plan({ type: "ask_memory", question: text }, "read", "Checking Team Memory.", understood.why);
}

/** "yes / haan / confirm" closes a pending confirmation; anything else cancels it. */
export function isConfirmation(raw: string): boolean {
  return /^(?:yes|yeah|yep|haan|haa|ha|ji|ji haan|confirm|confirmed|do it|kar do|theek hai|ok|okay|sure)[.!]?$/i.test(clean(raw));
}
