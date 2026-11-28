import { randomUUID } from "node:crypto";
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
export interface FrameSource { repository: string; sha: string; path: string; start: number; end: number }
export interface RecallFrame {
  id: string; participantId: string; at: string; zone: FrameZone;
  repository: string; sha: string;
  query?: string; answer?: string; note?: string; meetingId?: string;
  source?: FrameSource; tags: string[];
}
export interface RecallHit { frame: RecallFrame; score: number; why: string[]; freshness: "current" | "older_commit" }

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
    source = { repository: snapshot.repository, sha: snapshot.pinnedSha, path: file.path, start, end };
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

/** A browser-supplied IANA zone, or null when it is missing or unknown. */
export function validTimeZone(v: unknown): string | null {
  if (typeof v !== "string" || !v || v.length > 64) return null;
  try { new Intl.DateTimeFormat("en-US", { timeZone: v }); return v; } catch { return null; }
}

/**
 * Epoch ms of the most recent local midnight in `timeZone`. "Today" and "kal"
 * are the speaker's days, not the server's: on a UTC host an IST speaker at
 * 02:00 would otherwise get "today" starting at 05:30 the previous day.
 */
export function localMidnight(now: Date, timeZone: string): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const partsAt = (ms: number) => Object.fromEntries(fmt.formatToParts(new Date(ms)).map((p) => [p.type, Number(p.value)]));
  const offsetAt = (ms: number) => {
    const p = partsAt(ms);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
  };
  const today = partsAt(now.getTime());
  const wall = Date.UTC(today.year, today.month - 1, today.day);
  // The offset at midnight can differ from the offset now (a DST change that day).
  const guess = wall - offsetAt(now.getTime());
  return wall - offsetAt(guess);
}

/** The team default when the browser sent no zone: KKB_TIME_ZONE, else UTC. */
export const defaultTimeZone = () => validTimeZone(process.env.KKB_TIME_ZONE?.trim()) ?? "UTC";

/** Time words people actually use, in English and Hinglish. */
function timeWindow(q: string, now: Date, timeZone: string): { from: number; to: number; label: string } | null {
  const t = now.getTime(), s = localMidnight(now, timeZone);
  if (/\b(today|aaj)\b/.test(q)) return { from: s, to: t + 1, label: "today" };
  if (/\b(yesterday|kal)\b/.test(q)) return { from: localMidnight(new Date(s - 1), timeZone), to: s, label: "yesterday" };
  if (/\b(last week|pichhle hafte|pichle hafte|this week)\b/.test(q)) return { from: t - 7 * DAY, to: t + 1, label: "the last 7 days" };
  if (/\b(just now|abhi|a minute ago|thodi der pehle)\b/.test(q)) return { from: t - 30 * 60_000, to: t + 1, label: "the last 30 minutes" };
  return null;
}
const TIME_WORDS = /\b(today|aaj|yesterday|kal|last week|this week|pichh?le hafte|just now|abhi|a minute ago|thodi der pehle)\b/g;

/**
 * Rank frames for a recall question. Lexical match on everything the frame
 * holds (question, answer, note, path, tags), an exact-path bonus, and a gentle
 * recency prior (half-life 7 days). An empty question returns the latest frames.
 * Day words are read in `timeZone` (the speaker's, sent by the browser).
 */
export function recallFrames(frames: RecallFrame[], snapshot: Pick<EvidenceSnapshot, "pinnedSha">, question: string, now = new Date(), limit = 5, timeZone = defaultTimeZone()): { hits: RecallHit[]; window?: string } {
  const q = question.toLowerCase();
  const win = timeWindow(q, now, timeZone);
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
    hits.push({ frame: f, score: Math.round(score * 1000) / 1000, why, freshness: f.sha === snapshot.pinnedSha ? "current" : "older_commit" });
  }
  hits.sort((a, b) => b.score - a.score || Date.parse(b.frame.at) - Date.parse(a.frame.at));
  return { hits: hits.slice(0, limit), window: win?.label };
}
