import type { CodeGraph, GNode } from "./graph";

// Code search over the SHA-pinned snapshot, three ways (all dependency-free):
//   keyword   — exact identifier/path substring match, ranked by connectivity
//   bm25      — classic BM25 over each symbol's text (baseline)
//   semantic  — BM25 + concept expansion (plain words → code vocabulary)
//               + graph propagation (a symbol inherits evidence from the
//               file that defines it and from its callers/callees)
// "Semantic" here is lexical-semantic: no embeddings or model calls, so it is
// fast, explainable and runs in the browser. Evals: npm run graph:eval.

export type SearchMode = "keyword" | "bm25" | "semantic";
export interface DocEntry { id: string; kind: string; label: string; path: string; line: number; tokens: string[] }
export interface SearchIndex { sha: string; repository: string; docs: DocEntry[]; df: Record<string, number>; avgLen: number }
export interface Hit { id: string; label: string; kind: string; path: string; line: number; score: number; why: string[] }

const STOP = new Set("the a an is are was be to of and or for in on at by it this that with from as we our you your i me my do does did how what where which who when why there here code file function method thing get set use used using can should would will just so if then than into out up".split(" "));

export function splitIdent(s: string): string[] {
  return s.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_\-./#:]+/g, " ").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}
// Hindi/Hinglish function words (postpositions, question words, auxiliaries).
// A generic language list, not taken from any eval question: they carry no code
// meaning, and without it "kahan hai" or "wala" outweigh the words that do.
const HINGLISH_STOP = new Set("hai hain tha thi the ho hota hoti hote ka ki ke ko se me mein par pe ne bhi aur ya toh to kya kahan kaha kab kaun kaunsa kaunsi kis kisne kyun kaise jab agar woh wo yeh ye voh is us iska uska wala wali wale kar karo karta karti karte kiya kiye raha rahi rahe hua hue hui jata jati jaate liye lie sab kuch koi abhi bas na nahi haan ji".split(" "));
export const stem = (w: string) => (w.length > 4 ? w.replace(/(ings|ing|ies|es|ed|s)$/, "") : w);
export function tokenize(text: string): string[] {
  return splitIdent(text).filter((w) => w.length > 1 && !STOP.has(w) && !HINGLISH_STOP.has(w)).map(stem);
}

// Plain-language → code vocabulary. Small, inspectable, team-specific.
const CONCEPTS: Record<string, string[]> = {
  save: ["persist", "write", "store", "saved", "record"], stored: ["persist", "write", "store", "read", "back"],
  really: ["verify", "read", "back"], check: ["verify", "valid", "assert"], prove: ["verify", "assert", "passkey"],
  fingerprint: ["passkey", "webauthn", "assert", "step", "up"], touch: ["passkey", "webauthn"], biometric: ["passkey", "webauthn"],
  lead: ["leader", "step", "up"], leader: ["leader", "desk", "step", "up"], inbox: ["leader", "ticket", "pending"],
  login: ["session", "token", "auth"], identity: ["session", "caller", "actor", "token"], calling: ["caller", "call", "token"],
  phone: ["call", "bolna", "execution"], call: ["call", "bolna", "session"], status: ["status", "execution", "callback"],
  late: ["callback", "duplicate", "rank", "terminal"], repeated: ["duplicate", "replay", "idempotency"], duplicate: ["dedupe", "replay", "idempotency"],
  head: ["focus", "selector", "yaw", "zone"], turn: ["focus", "selector", "yaw"], agent: ["zone", "specialist"], pick: ["select", "focus", "activate", "zone"], choosing: ["select", "focus", "zone"],
  microphone: ["consent", "utterance", "mic"], permission: ["consent", "access", "authorized"], withdraw: ["consent", "revoke"], recording: ["utterance", "ingest"],
  ci: ["check", "conclusion", "sha", "stale"], commit: ["sha"], old: ["stale"], merged: ["pr", "merge"], github: ["github", "pull", "check", "run"],
  decision: ["decision", "memory", "approved"], decided: ["decision", "memory", "approved"], team: ["memory", "decision"], meeting: ["meeting", "passage", "wispr"],
  filler: ["filler", "correction", "understand"], correction: ["correction", "intent"], cleaned: ["understand", "filler"],
  explanation: ["explain", "principle", "highlight"], principle: ["explain"], smooth: ["damp", "spline", "curve", "bezier"], frame: ["damp", "decay"],
  curve: ["bezier", "spline", "catmull"], points: ["bezier", "spline"], unknown: ["ticket", "clarification", "escalate"], question: ["ticket", "clarification"],
  done: ["verify", "reconcile", "evidence", "merge"], log: ["event", "store", "append"], disk: ["file", "fsync", "append"], event: ["event", "store"],
  relevant: ["scout", "find", "search"], keyword: ["term", "scout", "search"], token: ["token", "hash", "session"], single: ["once", "token", "issue"],
};
// Generic software synonyms: everyday verbs people say and the words code uses for
// them. Deliberately tiny and not derived from any eval question.
const GENERIC: string[][] = [
  ["save", "store", "persist", "write", "record"], ["read", "load", "fetch", "get"], ["remove", "delete", "drop"],
  ["check", "verify", "validate", "assert"], ["old", "stale", "outdated"], ["allowed", "access", "permission"],
];
const GENERIC_MAP = new Map<string, string[]>();
for (const group of GENERIC) for (const w of group) GENERIC_MAP.set(stem(w), [...new Set([...(GENERIC_MAP.get(stem(w)) ?? []), ...group.filter((x) => x !== w)])]);

export function expand(terms: string[]): { term: string; w: number; from?: string }[] {
  const out = new Map<string, { term: string; w: number; from?: string }>();
  for (const t of terms) out.set(t, { term: t, w: 1 });
  for (const t of terms) for (const c of (Object.hasOwn(CONCEPTS, t) ? CONCEPTS[t] : Object.hasOwn(CONCEPTS, t + "s") ? CONCEPTS[t + "s"] : [])) for (const s of tokenize(c)) if (!out.has(s)) out.set(s, { term: s, w: 0.45, from: t });
  for (const t of terms) for (const c of GENERIC_MAP.get(t) ?? []) for (const s of tokenize(c)) if (!out.has(s)) out.set(s, { term: s, w: 0.35, from: t });
  return [...out.values()];
}

/**
 * Pseudo-relevance feedback (RM3-style): the best first-pass matches suggest
 * extra words the code itself uses for the idea. Rare terms only, low weight.
 */
function feedbackTerms(idx: SearchIndex, ranked: [string, number][], have: Set<string>, docs = 2, take = 6): { term: string; w: number; from: string }[] {
  const byId = new Map(idx.docs.map((d) => [d.id, d]));
  const top = ranked.slice(0, docs); const max = top[0]?.[1] ?? 0;
  if (max <= 0) return [];
  const weight = new Map<string, number>();
  for (const [id, sc] of top) {
    const d = byId.get(id); if (!d) continue;
    const tf = new Map<string, number>();
    for (const t of d.tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    for (const [t, f] of tf) {
      if (have.has(t) || t.length < 4 || (Object.hasOwn(idx.df, t) ? idx.df[t] : 0) > idx.docs.length * 0.05) continue;
      weight.set(t, (weight.get(t) ?? 0) + (f / d.tokens.length) * (sc / max));
    }
  }
  return [...weight.entries()].sort((a, b) => b[1] - a[1]).slice(0, take).map(([term]) => ({ term, w: 0.1, from: "feedback" }));
}

/** Build the index from snapshot files at the pinned SHA (run at build time). */
export function buildSearchIndex(g: CodeGraph, files: { path: string; content: string }[]): SearchIndex {
  const content = new Map(files.map((f) => [f.path, f.content.split("\n")]));
  const docs: DocEntry[] = [];
  for (const n of g.nodes) {
    const lines = content.get(n.path) ?? [];
    const parts: string[] = [];
    const nameT = tokenize(n.label);
    parts.push(...nameT, ...nameT, ...nameT); // name weighs most
    parts.push(...tokenize(n.path.replace(/\.[tj]sx?$/, "")));
    if (n.kind === "file" || n.kind === "test") {
      parts.push(...tokenize(lines.slice(0, 25).filter((l) => /^\s*(\/\/|\*|\/\*)/.test(l)).join(" ")));
    } else {
      const doc: string[] = [];
      for (let i = n.line - 2; i >= 0 && /^\s*(\/\/|\*|\/\*)/.test(lines[i] ?? ""); i--) doc.unshift(lines[i]);
      parts.push(...tokenize(doc.join(" ")), ...tokenize(doc.join(" ")));
      const body: string[] = [];
      for (let i = n.line - 1; i < Math.min(lines.length, n.line + 60); i++) { if (i > n.line - 1 && /^\s*export\s/.test(lines[i])) break; body.push(lines[i]); }
      parts.push(...tokenize(body.join(" ")));
    }
    docs.push({ id: n.id, kind: n.kind, label: n.label, path: n.path, line: n.line, tokens: parts });
  }
  const df: Record<string, number> = Object.create(null);
  for (const d of docs) for (const t of new Set(d.tokens)) df[t] = (df[t] ?? 0) + 1;
  const avgLen = docs.reduce((a, d) => a + d.tokens.length, 0) / Math.max(1, docs.length);
  return { sha: g.sha, repository: g.repository, docs, df, avgLen };
}

function bm25(idx: SearchIndex, q: { term: string; w: number }[], d: DocEntry): { s: number; matched: string[] } {
  const N = idx.docs.length, k1 = 1.2, b = 0.75;
  const tf = new Map<string, number>();
  for (const t of d.tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  let s = 0; const matched: string[] = [];
  for (const { term, w } of q) {
    const f = tf.get(term); if (!f) continue;
    const n = Object.hasOwn(idx.df, term) ? idx.df[term] : 0;
    const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
    s += w * idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.tokens.length) / idx.avgLen)));
    matched.push(term);
  }
  return { s, matched };
}

const COVERAGE = 0.6; // chosen on the development set only (0, 0.3, 0.6, 1.0 tried)
export function search(idx: SearchIndex, g: Pick<CodeGraph, "edges" | "nodes">, query: string, mode: SearchMode = "semantic", limit = 8): Hit[] {
  const raw = query.trim();
  if (!raw) return [];
  if (mode === "keyword") {
    const q = raw.toLowerCase();
    const deg = new Map(g.nodes.map((n: GNode) => [n.id, n.degree ?? 0]));
    return idx.docs.filter((d) => d.label.toLowerCase().includes(q) || d.path.toLowerCase().includes(q))
      .map((d) => ({ ...pick(d), score: (d.label.toLowerCase() === q ? 100 : d.label.toLowerCase().includes(q) ? 10 : 1) + (deg.get(d.id) ?? 0) / 100, why: [`“${raw}” in ${d.label.toLowerCase().includes(q) ? "name" : "path"}`] }))
      .sort((a, b) => b.score - a.score).slice(0, limit);
  }
  const terms = tokenize(raw);
  let q = mode === "semantic" ? expand(terms) : terms.map((t) => ({ term: t, w: 1 }));
  let base = new Map<string, { s: number; matched: string[] }>();
  for (const d of idx.docs) { const r = bm25(idx, q, d); if (r.s > 0) base.set(d.id, r); }
  if (mode === "semantic" && base.size) {
    const fb = feedbackTerms(idx, [...base.entries()].map(([id, r]) => [id, r.s] as [string, number]).sort((a, b) => b[1] - a[1]), new Set(q.map((x) => x.term)));
    if (fb.length) {
      q = [...q, ...fb];
      base = new Map();
      for (const d of idx.docs) { const r = bm25(idx, q, d); if (r.s > 0) base.set(d.id, r); }
    }
  }
  const scored = new Map<string, { s: number; why: string[] }>();
  for (const [id, r] of base) {
    const via = q.filter((x) => r.matched.includes(x.term) && (x as { from?: string }).from).map((x) => `${(x as { from?: string }).from}→${x.term}`);
    scored.set(id, { s: r.s, why: [`matched ${r.matched.slice(0, 5).join(", ")}`, ...(via.length ? [`concepts ${via.slice(0, 3).join(", ")}`] : [])] });
  }
  if (mode === "semantic") {
    // graph propagation: half of the best neighbour's evidence flows to a symbol
    const nb = new Map<string, string[]>();
    for (const e of g.edges) { (nb.get(e.from) ?? nb.set(e.from, []).get(e.from)!).push(e.to); (nb.get(e.to) ?? nb.set(e.to, []).get(e.to)!).push(e.from); }
    for (const d of idx.docs) {
      const own = base.get(d.id)?.s ?? 0;
      const best = Math.max(0, ...(nb.get(d.id) ?? []).map((n) => base.get(n)?.s ?? 0));
      if (best > 0 && own > 0) {
        const cur = scored.get(d.id)!;
        scored.set(d.id, { s: cur.s + 0.25 * best, why: [...cur.why, "boosted by connected code"] });
      }
    }
    // name coverage: a symbol whose own name is spelled out by the question is
    // the thing being asked about, not just a body that mentions the words.
    const qw = new Map(q.map((x) => [x.term, x.w]));
    for (const d of idx.docs) {
      const cur = scored.get(d.id); if (!cur || d.kind === "file" || d.kind === "test") continue;
      const name = [...new Set(tokenize(d.label))];
      if (!name.length) continue;
      const cov = name.reduce((a, t) => a + Math.min(1, qw.get(t) ?? 0), 0) / name.length;
      if (cov > 0) { cur.s *= 1 + COVERAGE * cov; cur.why.push(`name ${Math.round(cov * 100)}% in question`); }
    }
    // behaviour lives in functions in lib/; tests and UI copy are evidence, not answers
    for (const d of idx.docs) {
      const cur = scored.get(d.id); if (!cur) continue;
      const k = d.kind === "function" || d.kind === "class" ? 1.15 : d.kind === "file" ? 0.8 : d.kind === "test" ? 0.5 : 0.75;
      const layer = d.path.startsWith("tests/") ? 0.5 : d.path.endsWith(".tsx") ? 0.6 : d.path.startsWith("scripts/") ? 0.7 : 1;
      cur.s *= k * layer;
    }
  }
  return [...scored.entries()].map(([id, v]) => {
    const d = idx.docs.find((x) => x.id === id)!;
    return { ...pick(d), score: Math.round(v.s * 100) / 100, why: v.why };
  }).sort((a, b) => b.score - a.score).slice(0, limit);
}

const pick = (d: DocEntry) => ({ id: d.id, label: d.label, kind: d.kind, path: d.path, line: d.line });

/** grep baseline: rank FILES by raw occurrence count of the query words. */
export function grepFiles(files: { path: string; content: string }[], query: string, limit = 8): string[] {
  const words = query.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));
  return files.map((f) => { const c = f.content.toLowerCase(); return { p: f.path, n: words.reduce((a, w) => a + (c.split(w).length - 1), 0) }; })
    .filter((x) => x.n > 0).sort((a, b) => b.n - a.n).slice(0, limit).map((x) => x.p);
}
