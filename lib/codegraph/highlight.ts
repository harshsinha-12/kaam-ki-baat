import { expand, tokenize } from "./search";

// Precise source highlights. Instead of boxing the three lines under a
// declaration, find the whole symbol, keep its signature, and add the body
// lines that actually contain the words of the question (or their code
// synonyms). The person sees WHERE it is and WHY it matched, in at most
// three short boxes, without reading the function top to bottom.

export interface Span { start: number; end: number }
export interface Highlight extends Span { reason: string }

/** 1-based inclusive span of the symbol declared at `decl`, by brace matching. */
export function symbolSpan(lines: string[], decl: number, cap = 200): Span {
  let depth = 0, opened = false;
  const last = Math.min(lines.length, decl + cap - 1);
  for (let n = decl; n <= last; n++) {
    const code = (lines[n - 1] ?? "")
      .replace(/\/\/.*$/, "")
      .replace(/(["'`])(?:\\.|(?!\1).)*\1/g, "\"\"");
    for (const ch of code) {
      if (ch === "{" || ch === "(" || ch === "[") { depth++; opened = true; }
      else if (ch === "}" || ch === ")" || ch === "]") depth--;
    }
    if (opened && depth <= 0) {
      // A function's parameter list closes before its body opens: keep going.
      const next = (lines[n] ?? "").trim();
      if (/[:=]\s*$|=>\s*$|\{\s*$/.test(code.trim()) || /^(?:[{:]|=>|\.|\?)/.test(next)) continue;
      return { start: decl, end: n };
    }
    if (!opened && /;\s*$/.test(code)) return { start: decl, end: n };
  }
  return { start: decl, end: last };
}

/** Where the signature ends: the line where the parameter list has closed and the body opens. */
export function signatureEnd(lines: string[], span: Span): number {
  let paren = 0;
  for (let n = span.start; n <= Math.min(span.end, span.start + 12); n++) {
    const code = (lines[n - 1] ?? "").replace(/\/\/.*$/, "").replace(/(["'`])(?:\\.|(?!\1).)*\1/g, "\"\"");
    for (const ch of code) { if (ch === "(") paren++; else if (ch === ")") paren--; }
    if (paren <= 0 && /(?:\{|=>\s*\{?|=)\s*$/.test(code.trim())) return n;
  }
  return span.start;
}

/** The doc comment directly above a declaration, if any (1-based start). */
function docStart(lines: string[], decl: number): number {
  let n = decl - 1;
  while (n >= 1 && /^\s*(?:\/\/|\/\*|\*)/.test(lines[n - 1] ?? "")) n--;
  return n + 1;
}

export function highlightSymbol(lines: string[], decl: number, question: string, maxEvidence = 2): Highlight[] {
  const span = symbolSpan(lines, decl);
  const sigEnd = Math.min(signatureEnd(lines, span), span.start + 4);
  const out: Highlight[] = [{ start: span.start, end: sigEnd, reason: "Definition" }];
  const weights = new Map(expand(tokenize(question)).map((x) => [x.term, x.w]));
  if (!weights.size) return out;
  const scored: { n: number; s: number; words: string[] }[] = [];
  const doc = docStart(lines, span.start);
  const candidates = [...Array.from({ length: span.start - doc }, (_, i) => doc + i), ...Array.from({ length: Math.max(0, span.end - sigEnd) }, (_, i) => sigEnd + 1 + i)];
  for (const n of candidates) {
    const text = lines[n - 1] ?? "";
    if (!text.trim() || /^\s*[})\]];?\s*$/.test(text)) continue;
    const toks = new Set(tokenize(text));
    const words = [...toks].filter((t) => weights.has(t));
    const s = words.reduce((a, t) => a + weights.get(t)!, 0) + (/^\s*(?:\/\/|\*)/.test(text) ? 0.1 : 0);
    if (s >= 0.45) scored.push({ n, s, words });
  }
  scored.sort((a, b) => b.s - a.s || a.n - b.n);
  const picked = scored.slice(0, maxEvidence).sort((a, b) => a.n - b.n);
  for (const p of picked) {
    const near = out.find((h) => p.n >= h.start - 1 && p.n <= h.end + 1);
    if (near) { near.start = Math.min(near.start, p.n); near.end = Math.max(near.end, p.n); continue; }
    out.push({ start: p.n, end: p.n, reason: `Matches “${p.words.slice(0, 3).join(", ")}”` });
  }
  return out.sort((a, b) => a.start - b.start);
}
