import type { EvidenceSnapshot, MeetingPassage } from "../contracts";
import type { SourceRef } from "./contracts";
import type { Actor } from "./identity";

// One authorization boundary for all Team Memory surfaces. Meeting permission
// does not grant access to participant-only passages belonging to other tasks.
export function visibleMeetingPassages(snapshot: EvidenceSnapshot, actor: Actor) {
  const meetings = new Set(snapshot.meetings.filter(m => m.approvedBy.trim() && actor.meetingIds.includes(m.id)).map(m => m.id));
  const privatePassages = new Set(snapshot.tasks.filter(t => actor.participant.taskIds.includes(t.id) && meetings.has(t.meetingId))
    .flatMap(t => t.passageIds.map(id => JSON.stringify([t.meetingId, id]))));
  return snapshot.passages.filter(p => meetings.has(p.meetingId) &&
    (p.visibility === "team" || privatePassages.has(JSON.stringify([p.meetingId, p.id]))));
}

export function meetingSource(snapshot: EvidenceSnapshot, p: MeetingPassage): SourceRef {
  const m = snapshot.meetings.find(m => m.id === p.meetingId);
  return { kind: "wispr_meeting", id: p.id, meetingId: p.meetingId, meetingTitle: m?.title,
    label: `${m?.title ?? p.meetingId} · ${p.speaker ?? "Unknown speaker"} · chars ${p.charStart}–${p.charEnd}: “${p.text.slice(0, 160)}”`,
    speaker: p.speaker, charStart: p.charStart, charEnd: p.charEnd,
    sourceVersion: m?.sourceVersion, fetchedAt: m?.fetchedAt, textHash: p.textHash,
    url: safeWisprLink(m?.shareLink) };
}

export function safeWisprLink(value: string | undefined) {
  if (!value) return undefined;
  try {
    const u = new URL(value);
    return u.protocol === "https:" && u.hostname === "notes.wisprflow.ai" && u.pathname.startsWith("/shared/") && !u.username && !u.password ? u.href : undefined;
  } catch { return undefined; }
}

export function meetingCatalog(snapshot: EvidenceSnapshot, actor: Actor) {
  const passages = visibleMeetingPassages(snapshot, actor);
  return snapshot.meetings.filter(m => m.approvedBy.trim() && actor.meetingIds.includes(m.id)).map(m => ({
    id: m.id, title: m.title, date: m.date, source: m.source, sourceVersion: m.sourceVersion,
    fetchedAt: m.fetchedAt, shareLink: safeWisprLink(m.shareLink),
    passageCount: passages.filter(p => p.meetingId === m.id).length,
  }));
}

const STOP = new Set("the and what did does have this that with from about meeting meetings notes context recorded said discuss discussed decide decided agree agreed show tell give please team wispr flow was were who how why when where for are you our can into".split(" "));
const words = (text: string) => [...new Set((text.toLowerCase().match(/[\p{L}\p{M}\p{N}_-]+/gu) ?? []).filter(w => w.length > 2 && !STOP.has(w)))];

/** Rank before limiting so a relevant late passage is not hidden by the first page. */
export function meetingContext(snapshot: EvidenceSnapshot, actor: Actor, question: string, meetingId?: string) {
  const query = words(question);
  const passages = visibleMeetingPassages(snapshot, actor).filter(p => !meetingId || p.meetingId === meetingId);
  const ranked = passages.map(p => {
    const m = snapshot.meetings.find(m => m.id === p.meetingId)!;
    const text = new Set(words(`${p.text} ${p.speaker ?? ""} ${m.title}`));
    return { p, score: query.filter(w => text.has(w)).length };
  }).filter(x => query.length === 0 || x.score > 0).sort((a, b) => b.score - a.score);
  let remaining = 12_000;
  const selected = ranked.slice(0, 6).flatMap(({ p }) => {
    if (remaining <= 0) return [];
    const text = p.text.slice(0, Math.min(2400, remaining));
    remaining -= text.length;
    return [{ ...p, text, excerptCharEnd: p.charStart + text.length, truncated: text.length < p.text.length,
      source: meetingSource(snapshot, p) }];
  });
  return { meetings: meetingCatalog(snapshot, actor).filter(m => !meetingId || m.id === meetingId), passages: selected };
}
