import type { EvidenceSnapshot } from "../contracts";
import type { GraphAnswer } from "./graph";
import { highlightSymbol } from "./highlight";

// Explain a code answer from first principles, in the order a teammate would
// reason: what this code is for → the rule it must keep → the exact lines that
// keep it → how it breaks → how to check. Also returns the line ranges to box
// in the browser. Built only from the pinned file text and the meeting rule.

export interface Highlight { start: number; end: number; reason: string }
export interface FirstPrinciples {
  path: string; sha: string; url: string; symbol: string;
  steps: { title: string; text: string }[];
  highlights: Highlight[];
  lines: { n: number; text: string }[]; // the function body at the pinned SHA
  speak: string;
}

const RULES: [RegExp, string][] = [
  [/timeout|withtimeout/i, "waits a bounded time; if the store doesn't answer, it gives up"],
  [/\.read\(|read-back|readback|actual/i, "reads the record back from the store"],
  [/saved:\s*false/i, "reports a failure instead of claiming success"],
  [/saved:\s*true/i, "the only place it is allowed to say saved"],
  [/authoriz|trustedactor|unauthorized/i, "refuses callers who aren't allowed"],
  [/idempotency|replayed/i, "makes a repeated request return the first result"],
];

export function explainFirstPrinciples(snapshot: EvidenceSnapshot, a: GraphAnswer, rule?: string, question?: string): FirstPrinciples | null {
  if (!a.seed) return null;
  const file = snapshot.files.find((f) => f.path === a.seed!.path);
  if (!file) return null;
  const all = file.content.split("\n");
  // function body: from the definition to the next top-level export (max 70 lines)
  const start = a.seed.line;
  let end = start;
  while (end < all.length && end - start < 70 && !(end > start && /^\s*export\s/.test(all[end]))) end++;
  const body = all.slice(start - 1, end).map((text, i) => ({ n: start + i, text }));

  // doc comment above the function = what it is for
  const doc: string[] = [];
  for (let i = start - 2; i >= 0 && /^\s*(\/\/|\*|\/\*)/.test(all[i]); i--) doc.unshift(all[i].replace(/^\s*(\/\/+|\/?\*+\/?)\s?/, ""));

  const highlights: Highlight[] = [];
  for (const l of body) {
    const hit = RULES.find(([re]) => re.test(l.text));
    if (hit && !highlights.some((h) => h.reason === hit[1])) highlights.push({ start: l.n, end: l.n, reason: hit[1] });
  }
  // No known rule in this body: box the signature and the lines that match the question.
  if (!highlights.length) for (const h of question ? highlightSymbol(all, start, question).filter((h) => h.end - start <= 95) : [])
    highlights.push({ ...h, reason: h.reason === "Definition" ? "where it is defined" : h.reason.replace(/^Matches/, "matches") });
  if (!highlights.length) highlights.push({ start, end: Math.min(end, start + 2), reason: "where the logic starts" });
  highlights.sort((x, y) => x.start - y.start);

  const test = a.path.find((p) => p.via === "tests");
  const caller = a.path.find((p) => p.via === "uses");
  const fname = a.seed.path.split("/").pop();
  const steps = [
    { title: "What it's for", text: doc.join(" ").trim() || `${a.seed.label} in ${fname} is where this behaviour lives${caller ? `; ${caller.node.path.split("/").pop()} calls it` : ""}.` },
    { title: "The rule it must keep", text: rule ?? "Whatever it reports must match what was actually stored." },
    { title: "The lines that keep the rule", text: highlights.map((h) => `line ${h.start}: ${h.reason}`).join("; ") + "." },
    { title: "How it breaks", text: highlights.some((h) => /gives up/.test(h.reason)) && highlights.some((h) => /reads the record back/.test(h.reason))
        ? "If a timed-out write is treated as success, or the read-back is skipped, the agent says \"saved\" for something that isn't there."
        : "If one of these lines is removed or bypassed, the rule above stops holding." },
    { title: "How to check", text: test ? `Run npm test -- ${test.node.path}, then try a write that times out.` : "Add a test that makes the store fail, and expect no \"saved\"." },
  ];
  const first = highlights[0];
  const speak = `Let's start from what ${a.seed.label} is supposed to do: ${steps[1].text} Open ${fname}. Look at line ${first.start}, it ${first.reason}${highlights[1] ? `, and line ${highlights[1].start}, it ${highlights[1].reason}` : ""}. I've boxed those lines on your screen.`;
  return {
    path: a.seed.path, sha: snapshot.pinnedSha, symbol: a.seed.label,
    url: `https://github.com/${snapshot.repository}/blob/${snapshot.pinnedSha}/${a.seed.path}#L${first.start}-L${highlights[highlights.length - 1].end}`,
    steps, highlights, lines: body, speak,
  };
}
