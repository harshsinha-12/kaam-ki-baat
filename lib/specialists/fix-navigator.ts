import type { CodeFinding, EvidenceSnapshot } from "../contracts";
import { enclosingSymbol, permalink } from "./code-scout";

// Agent B — Fix Navigator: turn Code Scout's findings into "open this, check
// that, run this test". Read-only: it never edits code (handoff §3, Agent B).

export interface NavigationPlan {
  target: CodeFinding | null;
  test: { path: string; line: number; url: string } | null;
  steps: string[];
  spoken: string;
}

export function fixNavigator(snapshot: EvidenceSnapshot, findings: CodeFinding[]): NavigationPlan {
  const target = findings.find((f) => !isTestPath(f.path)) ?? findings[0] ?? null;
  if (!target) {
    return { target: null, test: null, steps: [], spoken: "I couldn't find a matching file at the pinned commit. Tell me a function or file name and I'll look again." };
  }
  const test = findTest(snapshot, target);
  const fn = target.symbol ? `the ${target.symbol} function` : `line ${target.lineStart}`;
  const steps = [
    `Open ${target.path} at line ${target.lineStart} (${fn}) — commit ${target.commitSha.slice(0, 7)}.`,
    test ? `Read the regression test in ${test.path} around line ${test.line}.` : "No nearby test found — add one before changing behaviour.",
    test ? `Run: npm test -- ${test.path}` : "Run: npm test",
  ];
  const certainty = target.match === "confirmed" ? "This file is part of the PR." : "This is a likely match, not confirmed by the PR.";
  const spoken =
    `Open ${spokenPath(target.path)}, ${fn}, around line ${target.lineStart}. ${certainty}` +
    (test ? ` Then check the test in ${spokenPath(test.path)}.` : " There's no test next to it yet.");
  return { target, test, steps, spoken };
}

function findTest(snapshot: EvidenceSnapshot, target: CodeFinding) {
  const base = target.path.split("/").pop()!.replace(/\.[tj]sx?$/, "");
  for (const f of snapshot.files) {
    if (!isTestPath(f.path)) continue;
    const lines = f.content.split("\n");
    const idx = lines.findIndex((l) => (target.symbol && l.includes(target.symbol)) || l.includes(`/${base}"`) || l.includes(`/${base}'`));
    if (idx >= 0) {
      const sym = enclosingSymbol(lines, idx);
      void sym;
      return { path: f.path, line: idx + 1, url: permalink(snapshot.repository, snapshot.pinnedSha, f.path, idx + 1, idx + 1) };
    }
  }
  return null;
}

const isTestPath = (p: string) => /(^|\/)tests?\//.test(p) || /\.test\./.test(p);
// "lib/core/persist-update.ts" -> "persist-update dot ts in lib core" reads better on a call
const spokenPath = (p: string) => {
  const parts = p.split("/");
  const file = parts.pop()!;
  return parts.length ? `${file} in ${parts.join(" ")}` : file;
};
