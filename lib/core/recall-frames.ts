import { createHash, randomUUID } from "node:crypto";
import type { EvidenceSnapshot } from "../contracts";
import type { EventStore, StoredEvent } from "../store/event-store";
import { tokenize } from "../codegraph/search";
import { ev, zoneEvents } from "../zones/state";

// Recall frames: a "photographic" memory of what was on screen, kept as exact
// data instead of pixels. A frame records which agent was open, the question,
// the answer, and the file and line range at a pinned commit. Pixels would be
// heavy, unsearchable and could leak whatever else was on screen; a frame is a
// few hundred bytes, searchable in any language the person spoke, and reopening
// it rebuilds the source view from the currently authorized snapshot bytes.
//
// Frames are append-only, scoped to one participant and one repository, saved
// and read back before success is reported, and never contain source text.

export type FrameZone = "team_memory" | "leader_desk" | "code_navigator";
/** `digest` is sha256 of the exact lines start..end at capture: the frame's premise, never the text itself. */
export interface FrameSource { repository: string; sha: string; path: string; start: number; end: number; digest?: string }
export interface RecallFrame {
  id: string; participantId: string; at: string; zone: FrameZone;
  repository: string; sha: string;
  query?: string; answer?: string; note?: string; meetingId?: string;
  source?: FrameSource; tags: string[];
}
/**
 * Tethered source check (after "Dependency-Tethered Memory", arXiv 2610.25123):
 * a frame rests on the exact lines it showed, so a new commit only stales it
 * when those lines changed. `same` = same commit; `unchanged` = new commit,
 * same lines; `moved` = same lines found elsewhere in the file (`sourceNow`);
 * `changed` / `removed` = the premise no longer holds; `unknown` = an older
 * frame captured before digests existed.
 */
export type SourceCheck = "same" | "unchanged" | "moved" | "changed" | "removed" | "unknown";
export interface RecallHit {
  frame: RecallFrame; score: number; why: string[];
  /** "current" whenever the frame's premise still holds at the pinned commit. */
  freshness: "current" | "older_commit";
  sourceCheck?: SourceCheck;
  /** Where the remembered lines are now, when they moved. */
  sourceNow?: FrameSource;
}

const LIMIT = { query: 300, answer: 600, note: 200, path: 300, tags: 8, tag: 40 } as const;
const ZONES = new Set<FrameZone>(["team_memory", "leader_desk", "code_navigator"]);
const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);

export type CaptureResult = { ok: true; frame: RecallFrame; readBack: true } | { ok: false; status: number; reason: string };

/** Validate untrusted input from the browser into a bounded frame. */
export function frameFromInput(snapshot: EvidenceSnapshot, participantId: string, body: Record<string, unknown>, now = new Date()): RecallFrame | { error: string } {
  const zone = body.zone as FrameZone;
  if (!ZONES.has(zone)) return { error: "unknown zone" };
  let source: FrameSource | undefined;
  if (body.source !== undefined && body.source !== null) {
    const s = body.source as Record<string, unknown>;
    const path = str(s.path, LIMIT.path);
    const file = path ? snapshot.files.find((f) => f.path === path) : undefined;
    const start = Number(s.start), end = Number(s.end ?? s.start);
    if (!file) return { error: "source file is not in the approved snapshot" };
    const total = file.content.split("\n").length;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > total || end - start > 200) return { error: "source line range is invalid" };
    const lines = file.content.split("\n");
    source = { repository: snapshot.repository, sha: snapshot.pinnedSha, path: file.path, start, end, digest: linesDigest(lines, start, end) };
  }
  const tags = Array.isArray(body.tags) ? body.tags.map((t) => str(t, LIMIT.tag)).filter((t): t is string => !!t).slice(0, LIMIT.tags) : [];
  const meetingId = str(body.meetingId ?? body.meeting_id, 120);
  const frame: RecallFrame = {
    id: randomUUID(), participantId, at: now.toISOString(), zone,
    repository: snapshot.repository, sha: snapshot.pinnedSha,
    query: str(body.query, LIMIT.query), answer: str(body.answer, LIMIT.answer), note: str(body.note, LIMIT.note),
    meetingId, source, tags,
  };
  if (!frame.query && !frame.answer && !frame.source && !frame.note) return { error: "nothing on screen to remember" };
  return frame;
}

export function linesDigest(lines: string[], start: number, end: number): string {
  return createHash("sha256").update(lines.slice(start - 1, end).join("\n")).digest("hex");
}

type SnapshotFiles = Pick<EvidenceSnapshot, "pinnedSha"> & { files?: { path: string; content: string }[]; repository?: string };

/** Re-check a frame's premise against the currently pinned snapshot. */
export function checkSource(frame: RecallFrame, snapshot: SnapshotFiles): { check: SourceCheck; now?: FrameSource } {
  const src = frame.source;
  if (!src || frame.sha === snapshot.pinnedSha) return { check: "same" };
  if (!snapshot.files) return { check: "unknown" };
  const file = snapshot.files.find((f) => f.path === src.path);
  if (!file) return { check: "removed" };
  if (!src.digest) return { check: "unknown" };
  const lines = file.content.split("\n");
  const span = src.end - src.start;
  if (src.end <= lines.length && linesDigest(lines, src.start, src.end) === src.digest) return { check: "unchanged" };
  // Nearest relocation wins, so a block that moved a few lines is found first.
  const starts = Array.from({ length: Math.max(0, lines.length - span) }, (_, i) => i + 1)
    .sort((a, b) => Math.abs(a - src.start) - Math.abs(b - src.start));
  for (const at of starts) {
    if (linesDigest(lines, at, at + span) === src.digest)
      return { check: "moved", now: { ...src, sha: snapshot.pinnedSha, start: at, end: at + span } };
  }
  return { check: "changed" };
}

export async function captureFrame(store: EventStore, snapshot: EvidenceSnapshot, participantId: string, body: Record<string, unknown>, now = new Date()): Promise<CaptureResult> {
  const f = frameFromInput(snapshot, participantId, body, now);
  if ("error" in f) return { ok: false, status: 400, reason: f.error };
  await store.append(ev("recall_frame", participantId, f, f.at));
  const saved = framesFor(await store.all(), participantId, snapshot.repository).find((x) => x.id === f.id);
  if (!saved) return { ok: false, status: 500, reason: "The frame could not be read back, so it was not saved." };
  return { ok: true, frame: saved, readBack: true };
}

export function framesFor(events: StoredEvent[], participantId: string, repository: string): RecallFrame[] {
  return zoneEvents(events, "recall_frame")
    .filter((e) => e.key === participantId && e.data.participantId === participantId && e.data.repository === repository)
    .map((e) => e.data as unknown as RecallFrame);
}

const DAY = 86_400_000;
/** Time words people actually use, in English and Hinglish. */
function timeWindow(q: string, now: Date): { from: number; to: number; label: string } | null {
  const t = now.getTime(), start = new Date(now); start.setHours(0, 0, 0, 0);
  const s = start.getTime();
  if (/\b(today|aaj)\b/.test(q)) return { from: s, to: t + 1, label: "today" };
  if (/\b(yesterday|kal)\b/.test(q)) return { from: s - DAY, to: s, label: "yesterday" };
  if (/\b(last week|pichhle hafte|pichle hafte|this week)\b/.test(q)) return { from: t - 7 * DAY, to: t + 1, label: "the last 7 days" };
  if (/\b(just now|abhi|a minute ago|thodi der pehle)\b/.test(q)) return { from: t - 30 * 60_000, to: t + 1, label: "the last 30 minutes" };
  return null;
}
const TIME_WORDS = /\b(today|aaj|yesterday|kal|last week|this week|pichh?le hafte|just now|abhi|a minute ago|thodi der pehle)\b/g;

/**
 * Rank frames for a recall question. Lexical match on everything the frame
 * holds (question, answer, note, path, tags), an exact-path bonus, and a gentle
 * recency prior (half-life 7 days). An empty question returns the latest frames.
 */
export function recallFrames(frames: RecallFrame[], snapshot: SnapshotFiles, question: string, now = new Date(), limit = 5): { hits: RecallHit[]; window?: string } {
  const q = question.toLowerCase();
  const win = timeWindow(q, now);
  const pool = win ? frames.filter((f) => { const at = Date.parse(f.at); return at >= win.from && at < win.to; }) : frames;
  const terms = [...new Set(tokenize(q.replace(TIME_WORDS, " ")))];
  const df = new Map<string, number>();
  const docs = pool.map((f) => {
    const toks = new Set(tokenize([f.query, f.answer, f.note, f.source?.path, ...f.tags].filter(Boolean).join(" ")));
    for (const t of toks) df.set(t, (df.get(t) ?? 0) + 1);
    return { f, toks };
  });
  const N = Math.max(1, docs.length);
  const hits: RecallHit[] = [];
  for (const { f, toks } of docs) {
    const matched = terms.filter((t) => toks.has(t));
    let score = matched.reduce((a, t) => a + Math.log(1 + (N + 0.5) / ((df.get(t) ?? 0) + 0.5)), 0);
    const why: string[] = [];
    if (matched.length) why.push(`matched ${matched.slice(0, 4).join(", ")}`);
    if (f.source && q.includes(f.source.path.toLowerCase())) { score += 5; why.push("same file"); }
    const ageDays = Math.max(0, (now.getTime() - Date.parse(f.at)) / DAY);
    const recency = Math.pow(0.5, ageDays / 7);
    if (terms.length && !matched.length && !why.length) continue;
    score = (terms.length ? score : 1) * (0.6 + 0.4 * recency);
    if (win) why.push(`from ${win.label}`);
    const tether = checkSource(f, snapshot);
    const holds = tether.check === "same" || tether.check === "unchanged" || tether.check === "moved";
    if (tether.check === "unchanged") why.push("same lines at the new commit");
    if (tether.check === "moved") why.push(`lines moved to ${tether.now!.start}–${tether.now!.end}`);
    hits.push({
      frame: f, score: Math.round(score * 1000) / 1000, why,
      freshness: f.sha === snapshot.pinnedSha || (f.source && holds) ? "current" : "older_commit",
      ...(f.source ? { sourceCheck: tether.check } : {}),
      ...(tether.now ? { sourceNow: tether.now } : {}),
    });
  }
  hits.sort((a, b) => b.score - a.score || Date.parse(b.frame.at) - Date.parse(a.frame.at));
  return { hits: hits.slice(0, limit), window: win?.label };
}
