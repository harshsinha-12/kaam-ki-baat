import { createHash } from "node:crypto";
import type { EvidenceSnapshot, MeetingPassage, MeetingRecord } from "../contracts";
import { safeWisprLink } from "../zones/meeting-context";

// Input is a deliberately selected export from authenticated Wispr MCP reads,
// not a whole-account export or a guessed transcript from a summary.
export interface WisprMeetingImport { meeting: MeetingRecord; passages: MeetingPassage[] }
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const record = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const nonempty = (x: unknown): x is string => typeof x === "string" && x.trim().length > 0;

export function validateWisprImport(input: unknown, approvedBy: string): WisprMeetingImport {
  if (!nonempty(approvedBy)) throw Error("An explicit meeting approver is required");
  if (!record(input) || !record(input.meeting) || !Array.isArray(input.passages)) throw Error("Expected a selected meeting and exact passages from a Wispr MCP read");
  const m = input.meeting;
  if (!nonempty(m.id) || !nonempty(m.title) || m.source !== "LIVE" || !nonempty(m.sourceVersion) ||
      typeof m.fetchedAt !== "string" || !Number.isFinite(Date.parse(m.fetchedAt)))
    throw Error("Wispr import requires LIVE source, ID, title, sourceVersion and fetchedAt");
  if (m.shareLink !== undefined && (typeof m.shareLink !== "string" || !safeWisprLink(m.shareLink))) throw Error("Invalid Wispr share link");
  if (m.date !== undefined && (typeof m.date !== "string" || !Number.isFinite(Date.parse(m.date)))) throw Error("Invalid meeting date");
  const seen = new Set<string>();
  const passages = input.passages.map((p): MeetingPassage => {
    if (!record(p) || p.kind !== "meeting" || !nonempty(p.id) || p.meetingId !== m.id || !nonempty(p.text) ||
        !Number.isSafeInteger(p.charStart) || !Number.isSafeInteger(p.charEnd) || Number(p.charStart) < 0 ||
        Number(p.charEnd) - Number(p.charStart) !== p.text.length || !["team", "participant"].includes(String(p.visibility)) ||
        (p.speaker !== undefined && typeof p.speaker !== "string"))
      throw Error("Passages require unique IDs, matching meeting, exact normalized spans and explicit visibility");
    if (seen.has(p.id)) throw Error("Duplicate passage ID");
    seen.add(p.id);
    const textHash = hash(p.text);
    if (p.textHash !== undefined && p.textHash !== textHash) throw Error("Passage hash does not match source text");
    return { kind: "meeting", id: p.id, meetingId: m.id as string, speaker: p.speaker as string | undefined,
      charStart: p.charStart as number, charEnd: p.charEnd as number, text: p.text,
      visibility: p.visibility as MeetingPassage["visibility"], textHash };
  });
  if (!passages.length) throw Error("No permitted passages to import; do not fabricate a denied transcript");
  return { meeting: { id: m.id, title: m.title, source: "LIVE", approvedBy: approvedBy.trim(),
    sourceVersion: m.sourceVersion, fetchedAt: m.fetchedAt, date: m.date as string | undefined,
    sourceCreatedAt: typeof m.sourceCreatedAt === "string" ? m.sourceCreatedAt : undefined,
    transcriptHash: typeof m.transcriptHash === "string" ? m.transcriptHash : undefined,
    shareLink: safeWisprLink(m.shareLink as string | undefined) }, passages };
}

/** Pure/idempotent merge. Explicit participant grants never create task ownership. */
export function importWisprMeeting(snapshot: EvidenceSnapshot, input: unknown, approvedBy: string, participantIds: string[]) {
  const doc = validateWisprImport(input, approvedBy);
  if (participantIds.some(id => !snapshot.participants.some(p => p.id === id))) throw Error("Unknown participant; no access was changed");
  const ids = new Set(doc.passages.map(p => p.id));
  if (snapshot.passages.some(p => p.meetingId !== doc.meeting.id && ids.has(p.id))) throw Error("Passage ID collides with another meeting");
  if (snapshot.tasks.some(t => t.meetingId === doc.meeting.id && t.passageIds.some(id => !ids.has(id))))
    throw Error("Import would remove evidence referenced by an existing task");
  const referenced = new Set(snapshot.tasks.filter(t => t.meetingId === doc.meeting.id).flatMap(t => t.passageIds));
  if (snapshot.passages.some(p => p.meetingId === doc.meeting.id && referenced.has(p.id) && doc.passages.some(next =>
    next.id === p.id && (next.text !== p.text || next.charStart !== p.charStart || next.charEnd !== p.charEnd || next.speaker !== p.speaker))))
    throw Error("Import would change evidence referenced by an existing task; review its mapping first");
  return { ...snapshot,
    // Repository and overall LIVE/FIXTURE status remain exactly as verified.
    meetings: [...snapshot.meetings.filter(m => m.id !== doc.meeting.id), doc.meeting],
    passages: [...snapshot.passages.filter(p => p.meetingId !== doc.meeting.id), ...doc.passages],
    participants: snapshot.participants.map(p => participantIds.includes(p.id) ? { ...p, meetingIds: [...new Set([...p.meetingIds, doc.meeting.id])] } : p),
  };
}
