import { randomUUID } from "node:crypto";
import type { EvidenceSnapshot } from "../contracts";
import type { EventStore, StoredEvent } from "../store/event-store";
import { ev, zoneEvents } from "../zones/state";
import { tokenize } from "./search";
import { highlightSymbol } from "./highlight";

export interface SourceHighlight { start: number; end: number; reason: string }
export interface CodeSourceFocus {
  repository: string; sha: string; path: string; url: string;
  highlights: SourceHighlight[];
  lines: { n: number; text: string }[];
  totalLines: number;
  from: string; at: string; revision: string;
}
export type SourceExcerpt = Omit<CodeSourceFocus, "from" | "at" | "revision">;

/** Only bytes already in the approved snapshot can enter the source viewer. */
export function sourceExcerpt(snapshot: EvidenceSnapshot, path: unknown, highlights: SourceHighlight[]): SourceExcerpt | null {
  if (typeof path !== "string") return null;
  const file = snapshot.files.find(f => f.path === path);
  if (!file || !highlights.length || highlights.length > 8) return null;
  const all = file.content.split("\n");
  if (highlights.some(h => !Number.isInteger(h.start) || !Number.isInteger(h.end) || h.start < 1 || h.end < h.start || h.end > all.length)) return null;
  const start = Math.min(...highlights.map(h => h.start)), end = Math.max(...highlights.map(h => h.end));
  if (end - start > 100) return null;
  const a = Math.max(1, start - 10), b = Math.min(all.length, Math.max(end + 10, a + 79));
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return {
    repository: snapshot.repository, sha: snapshot.pinnedSha, path,
    url: `https://github.com/${snapshot.repository}/blob/${snapshot.pinnedSha}/${encodedPath}#L${start}-L${end}`,
    highlights: highlights.map(h => ({ ...h, reason: String(h.reason).slice(0, 200) })),
    lines: all.slice(a - 1, b).map((text, i) => ({ n: a + i, text })), totalLines: all.length,
  };
}

export function questionSource(snapshot: EvidenceSnapshot, question: string, passages: { path: string; lineStart: number; lineEnd: number; anchorLine?: number }[]): SourceExcerpt | null {
  const passage = passages.find(p => /\.[cm]?[jt]sx?$|\.py$|\.swift$|\.go$|\.rs$/.test(p.path)) ?? passages[0];
  if (!passage) return null;
  const file = snapshot.files.find(f => f.path === passage.path);
  if (!file) return null;
  const terms = new Set(tokenize(question)), lines = file.content.split("\n");
  if (passage.anchorLine !== undefined) {
    // Signature plus the body lines that match the question, kept inside the viewer's 100-line window.
    const marks = highlightSymbol(lines, passage.anchorLine, question).filter(h => h.end - passage.anchorLine! <= 95);
    return sourceExcerpt(snapshot, passage.path, marks.map(h => ({ ...h, reason: h.reason === "Definition"
      ? "Candidate symbol found through code search · verify in context" : `${h.reason} · candidate for review` })));
  }
  let best = passage.lineStart, score = -1;
  for (let n = passage.lineStart; n <= passage.lineEnd; n++) {
    const text = lines[n - 1] ?? "";
    let matched = new Set(tokenize(text).filter(t => terms.has(t))).size;
    const declaration = text.match(/\b(?:function|class|interface|type|const)\s+([A-Za-z0-9_]+)/);
    if (declaration && tokenize(declaration[1]).every(t => terms.has(t))) matched += terms.size + 3;
    if (matched > score) { best = n; score = matched; }
  }
  if (!terms.size || score <= 0) return null;
  return sourceExcerpt(snapshot, passage.path, [{ start: best, end: Math.min(lines.length, best + 2), reason: "Source matching your question · candidate for review" }]);
}

/** Persist and read back before returning a pointer to the browser or voice tool. */
export async function publishSource(store: EventStore, participantId: string, source: SourceExcerpt, from: "web" | "call" | "browse"): Promise<CodeSourceFocus> {
  const revision = randomUUID(), at = new Date().toISOString();
  await store.append(ev("code_focus", participantId, { ...source, from, revision }, at));
  const saved = zoneEvents(await store.all(), "code_focus").find(e => e.key === participantId && e.data.revision === revision);
  if (!saved) throw new Error("Source focus could not be read back.");
  return { ...source, from, revision, at: saved.at };
}

/** Rebuild from current authorized bytes; never replay stale stored source text. */
export function readSource(snapshot: EvidenceSnapshot, events: StoredEvent[], participantId: string): CodeSourceFocus | null {
  const focused = zoneEvents(events, "code_focus").filter(e => e.key === participantId);
  const last = focused[focused.length - 1];
  if (!last || last.data.sha !== snapshot.pinnedSha || (last.data.repository !== undefined && last.data.repository !== snapshot.repository)) return null;
  if (!Array.isArray(last.data.highlights) || last.data.highlights.some(h => !h || typeof h !== "object")) return null;
  const source = sourceExcerpt(snapshot, last.data.path, last.data.highlights as SourceHighlight[]);
  return source ? { ...source, from: typeof last.data.from === "string" ? last.data.from : "web", at: last.at,
    revision: typeof last.data.revision === "string" ? last.data.revision : `${last.at}:${focused.length}` } : null;
}
