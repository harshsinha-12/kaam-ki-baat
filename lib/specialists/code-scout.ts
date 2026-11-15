import type { CodeFinding, EvidenceSnapshot, Task } from "../contracts";
import { graphFindings } from "../evidence/code-graph";

// Agent A — Code Scout: optional scoped Graphify index (D-039), with a bounded
// keyword fallback for snapshots without a usable graph. No embeddings.
// A hit is "confirmed" only when the file is also changed by the task's PR;
// a keyword-only hit stays a "candidate".

const STOP = new Set(["the", "a", "an", "is", "it", "to", "of", "and", "or", "for", "in", "on", "where", "which", "what", "how", "me", "my", "code", "file", "kahan", "hai", "ka", "ki", "ke", "show", "find", "this", "that", "do", "i"]);

export function queryTerms(task: Task | undefined, utterance: string): string[] {
  const fromUtterance = utterance
    .toLowerCase()
    .split(/[^a-z0-9_-]+/)
    .filter((w) => w.length > 3 && !STOP.has(w));
  return [...new Set([...(task?.searchTerms ?? []).map((t) => t.toLowerCase()), ...fromUtterance])];
}

export function codeScout(snapshot: EvidenceSnapshot, task: Task | undefined, utterance: string, limit = 3): CodeFinding[] {
  limit = Math.max(0, Math.min(10, Number.isFinite(limit) ? Math.floor(limit) : 3));
  if (!limit) return [];
  const terms = queryTerms(task, utterance);
  if (!terms.length) return [];
  const graph = graphFindings(snapshot, task, terms, limit);
  if (graph.length) return graph;
  const pr = task?.prNumber != null ? snapshot.pullRequests.find((p) => p.number === task.prNumber) : undefined;
  const changed = new Set(pr?.changedFiles ?? []);
  const seeds = (task?.searchTerms ?? []).map(t => t.toLowerCase()).filter(Boolean);

  const scored: Array<CodeFinding & { score: number }> = [];
  for (const file of snapshot.files) {
    // Generic question words such as "matching implementation" must not create
    // a task match when none of the task's curated source terms occurs here.
    const haystack = `${file.path}\n${file.content}`.toLowerCase();
    if (seeds.length && !seeds.some(term => haystack.includes(term))) continue;
    const lines = file.content.split("\n");
    let best = { line: -1, score: 0 };
    lines.forEach((text, i) => {
      const lower = text.toLowerCase();
      const s = terms.reduce((acc, t) => acc + (lower.includes(t) ? 1 : 0), 0);
      // prefer definitions over mentions
      const bonus = /\b(function|class|interface|const|export)\b/.test(text) ? 0.5 : 0;
      if (s > 0 && s + bonus > best.score) best = { line: i, score: s + bonus };
    });
    if (best.line < 0) continue;
    const pathBonus = terms.some((t) => file.path.toLowerCase().includes(t)) ? 1 : 0;
    const isTest = /(^|\/)tests?\//.test(file.path) || /\.test\./.test(file.path);
    const symbol = enclosingSymbol(lines, best.line);
    const start = best.line + 1; // exact matching line (1-based) — this is what gets spoken
    const end = Math.min(lines.length, best.line + 1 + 2);
    scored.push({
      kind: "code",
      id: `code:${snapshot.pinnedSha.slice(0, 7)}:${file.path}:${best.line + 1}`,
      repository: snapshot.repository,
      commitSha: snapshot.pinnedSha,
      path: file.path,
      lineStart: start,
      lineEnd: end,
      symbol,
      excerpt: lines.slice(start - 1, end).join("\n").slice(0, 400),
      match: changed.has(file.path) ? "confirmed" : "candidate",
      url: permalink(snapshot.repository, snapshot.pinnedSha, file.path, start, end),
      score: best.score + pathBonus + (changed.has(file.path) ? 1 : 0) - (isTest ? 0.75 : 0),
    });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, limit)
    .map(({ score: _s, ...f }) => f);
}

export function enclosingSymbol(lines: string[], from: number): string | undefined {
  const re = /(?:export\s+)?(?:async\s+)?(?:function\s+([A-Za-z0-9_]+)|(?:const|let)\s+([A-Za-z0-9_]+)\s*=|class\s+([A-Za-z0-9_]+)|interface\s+([A-Za-z0-9_]+))/;
  for (let i = from; i >= 0 && i > from - 80; i--) {
    const m = lines[i].match(re);
    if (m) return m[1] ?? m[2] ?? m[3] ?? m[4];
  }
  return undefined;
}

export const permalink = (repo: string, sha: string, path: string, a: number, b: number) =>
  `https://github.com/${repo}/blob/${sha}/${path}#L${a}-L${b}`;
