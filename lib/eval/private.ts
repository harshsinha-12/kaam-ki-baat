import { createHash } from "node:crypto";
import type { EvidenceSnapshot } from "../contracts";
import type { SavedUpdate } from "../core/persist-update";
import type { StoredEvent } from "../store/event-store";
import { executionId } from "./recorder";

export const EVALUATOR_VERSION = "e1-demo-1";
export type Verdict = "pass" | "fail" | "inconclusive";
export interface Check { verdict: Verdict; reason: string }
export interface EvaluationInput {
  execution: Record<string, unknown>;
  callId: string;
  events: StoredEvent[] | null;
  snapshot: EvidenceSnapshot | null;
  consent: Record<string, unknown> | null;
  manifest: Record<string, unknown> | null;
  attempt: Record<string, unknown> | null;
  // Independently re-read using a fresh EventStore, never copied from tool text.
  readBacks: SavedUpdate[] | null;
}

export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
}
export const digest = (value: unknown) => createHash("sha256").update(canonical(value)).digest("hex");
const check = (verdict: Verdict, reason: string): Check => ({ verdict, reason });
const terminal = new Set(["completed", "failed", "busy", "no-answer", "canceled", "cancelled", "stopped", "error", "balance-low"]);
// Offset-free provider timestamps are not silently interpreted as local or UTC.
const time = (v: unknown): number | null => {
  if (typeof v !== "string" || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(v)) return null;
  const n = Date.parse(v); return Number.isFinite(n) ? n : null;
};

/** Retain only this call, execution callbacks and potentially conflicting links. */
export function scopeAudit(events: StoredEvent[], callId: string, id: string): StoredEvent[] {
  return events.filter(e => e.type === "call_execution" ? e.callId === callId || e.executionId === id
    : e.type === "call_session" ? e.session?.callId === callId
    : e.type === "task_update" ? e.record?.callId === callId
    : e.type === "zone" ? e.kind === "bolna_execution" && e.key === id
    : e.callId === callId);
}

/** Deterministic evidence checks; no transcript judge or eligibility certification. */
export function evaluatePrivate(input: EvaluationInput) {
  const { execution: raw, callId, snapshot, consent, manifest, attempt, readBacks } = input;
  const id = executionId(raw.id);
  const events = scopeAudit(input.events ?? [], callId, id);
  const checks: Record<string, Check> = {};
  const status = typeof raw.status === "string" && terminal.has(raw.status) ? raw.status : "pending";
  const duration = status !== "pending" && typeof raw.conversation_duration === "number"
    && Number.isFinite(raw.conversation_duration) && raw.conversation_duration >= 0 ? raw.conversation_duration : null;
  checks.completed = status === "pending" ? check("inconclusive", "Execution is not finalized.")
    : status === "completed" ? check("pass", "Provider reports completed.") : check("fail", "Provider reports a terminal non-completed call.");
  checks.duration = duration === null ? check("inconclusive", "Final provider duration unavailable.")
    : check(duration > 45 ? "pass" : "fail", "Final provider conversation duration must be strictly over 45 seconds.");

  const links = events.filter(e => e.type === "call_execution");
  const matching = links.filter(e => e.callId === callId && e.executionId === id);
  const providerAgent = typeof raw.agent_id === "string" && raw.agent_id.trim() ? raw.agent_id : null;
  const conflict = links.some(e => e.callId !== callId || e.executionId !== id || (providerAgent !== null && e.agentId !== providerAgent));
  checks.correlation = conflict ? check("fail", "Execution/call/agent mapping conflicts in the persisted audit.")
    : matching.length && providerAgent !== null ? check("pass", "Persisted execution, local call and agent agree.")
    : check("inconclusive", "No persisted execution-to-call mapping; operator ID alone is insufficient.");
  const sessions = events.filter(e => e.type === "call_session").map(e => e.session);
  const uniqueSessions = [...new Map(sessions.map(s => [canonical(s), s])).values()];
  const session = uniqueSessions.length === 1 ? uniqueSessions[0] : null;
  const submitted = attempt?.callId === callId && attempt.executionId === id && attempt.state === "submitted"
    ? time(attempt.submittedAt) : null;
  const consentAt = time(consent?.recordedAt);
  const callStart = submitted ?? time(raw.created_at);
  checks.consent = consent?.consentToCall === false || consent?.consentToRecording === false
    ? check("fail", "Receipt explicitly declines calling or recording.")
    : !consent || !session || !session.consentRecordedBy?.trim() || consentAt === null || callStart === null
      || consent.consentToCall !== true || consent.consentToRecording !== true
      ? check("inconclusive", "Explicit dated consent receipt and matching session are required.")
      : consent.participantId !== session.participantId || consentAt > callStart
        || (typeof consent.channel === "string" && matching.some(e => e.channel !== consent.channel))
        ? check("fail", "Consent participant, channel or chronology does not match this call.")
        : check("pass", "Stored receipt matches participant and predates submission; authenticity, call-specific permission and eligibility need review.");
  checks.source = !snapshot || !session || !manifest || typeof snapshot.pinnedSha !== "string" || !snapshot.pinnedSha.trim()
    || typeof snapshot.repository !== "string" || !snapshot.repository.trim() || typeof manifest.snapshotSha !== "string"
    || typeof manifest.callId !== "string" || typeof manifest.participantId !== "string"
    ? check("inconclusive", "Captured snapshot, session and complete preparation manifest required.")
    : manifest.callId !== callId || manifest.participantId !== session.participantId
      || manifest.snapshotSha !== snapshot.pinnedSha || session.repository !== snapshot.repository
      ? check("fail", "Captured snapshot does not match preparation/session repository SHA.")
      : check("pass", "Captured snapshot retained; repository SHA matches preparation. Exact pre-call snapshot bytes were not hashed by the launcher.");
  let version: string | null = null;
  try { version = executionId(raw.agent_version_id); } catch { /* Missing version stays inconclusive. */ }
  checks.agentVersion = version ? check("pass", "Provider agent version retained.") : check("inconclusive", "Provider agent version unavailable.");

  // Local lifecycle receipts bound audit attribution. They are not audio timing
  // measurements or a substitute for the authoritative provider duration.
  const lifecycle = events.filter((e): e is Extract<StoredEvent, { type: "zone" }> => e.type === "zone" && e.kind === "bolna_execution" && e.key === id
    && (!e.data.agentId || e.data.agentId === raw.agent_id));
  const starts = lifecycle.filter(e => ["in-progress", "in_progress"].includes(String(e.data.status)))
    .map(e => time(e.at)).filter((n): n is number => n !== null).sort((a, b) => a - b);
  const start = starts[0] ?? null;
  // Completion can be delivered much later during post-processing. It cannot
  // replace a missing disconnect receipt for tool-attribution purposes.
  const ends = lifecycle.filter(e => e.data.status === "call-disconnected")
    .map(e => time(e.at)).filter((n): n is number => n !== null && start !== null && n >= start).sort((a, b) => a - b);
  const end = ends[0] ?? null;
  const bounded = checks.correlation.verdict === "pass" && start !== null && end !== null
    && callStart !== null && start >= callStart;
  const inWindow = (at: string) => { const n = time(at); return bounded && n !== null && n >= start! && n <= end!; };
  checks.auditWindow = bounded ? check("pass", "Tool counts use in-progress through first disconnect receipt; setup and later events excluded. These are audit bounds, not measured audio timing.")
    : check("inconclusive", "Missing unambiguous correlation or lifecycle bounds; no voice-time tool counts inferred.");
  const allTools = events.filter(e => e.type === "tool_call");
  const tools = allTools.filter(e => inWindow(e.at));
  checks.tools = tools.some(e => !e.ok) ? check("fail", "At least one captured call-window tool failed.")
    : !bounded || !tools.length || allTools.some(e => time(e.at) === null)
      ? check("inconclusive", "Tool outcomes unavailable or incompletely timed.")
      : check("pass", "Captured call-window tools succeeded; full provider-log coverage is not inferred.");

  const updates = events.filter((e): e is Extract<StoredEvent, { type: "task_update" }> => e.type === "task_update" && inWindow(e.at));
  const writes = [...new Map(updates.map(e => [e.record.id, e.record])).values()].map(record => {
    const recordTime = time(record.at);
    const returned = tools.some(e => e.tool === "record_task_update" && e.ok && e.evidenceIds.includes(record.id)
      && recordTime !== null && inWindow(record.at) && time(e.at)! >= recordTime);
    const actual = readBacks?.find(r => r.id === record.id);
    const participant = snapshot?.participants.find(p => p.id === session?.participantId);
    const task = snapshot?.tasks.find(t => t.id === record.taskId);
    const authorized = participant && task && session && participant.taskIds.includes(task.id)
      && participant.meetingIds.includes(task.meetingId) && session.meetingIds.includes(task.meetingId)
      && task.assignment.state === "accepted" && task.assignment.ownerId === participant.id && record.actorId === participant.id;
    const conflicting = updates.some(e => e.record.id === record.id && canonical(e.record) !== canonical(record));
    const result = conflicting || (actual && canonical(actual) !== canonical(record)) || (participant && task && !authorized)
      ? check("fail", "Persisted record, read-back or authorized ownership conflicts.")
      : !actual || !returned || !authorized || [checks.correlation, checks.source, checks.consent].some(c => c.verdict !== "pass")
        ? check("inconclusive", "Need matching successful tool receipt, fresh persisted read-back, source, consent and task authorization.")
        : check("pass", "Record and fresh-store read-back match the authorized call/task and successful tool receipt.");
    return { record, toolReceipt: returned, readBack: actual ?? null, ...result };
  });
  const saveTools = tools.filter(e => e.tool === "record_task_update");
  const unpairedSave = saveTools.some(e => e.ok && !writes.some(w => e.evidenceIds.includes(w.record.id)));
  checks.persistedWrites = writes.some(w => w.verdict === "fail") || saveTools.some(e => !e.ok)
    ? check("fail", "A recorded write or save attempt failed evidence checks.")
    : unpairedSave ? check("inconclusive", "A successful save tool lacks its matching persisted record.")
    : writes.length && writes.every(w => w.verdict === "pass") ? check("pass", "Recorded writes have independent persisted postcondition evidence.")
    : check("inconclusive", "Verified saved update not demonstrated by available evidence.");
  checks.explicitConfirmation = check("inconclusive", "Review exact task/status agreement in transcript/audio; tool success or intent to work is insufficient.");
  checks.eligibility = [checks.completed, checks.duration, checks.correlation, checks.consent].some(c => c.verdict === "fail")
    ? check("fail", "A checked qualification prerequisite failed.")
    : check("inconclusive", "Organizer rules and human eligibility review remain outstanding.");
  const sourceParticipant = snapshot?.participants.find(p => p.id === session?.participantId);
  const permittedTasks = snapshot?.tasks.filter(t => session?.meetingIds.includes(t.meetingId)
    && sourceParticipant?.meetingIds.includes(t.meetingId) && sourceParticipant.taskIds.includes(t.id)) ?? [];
  return {
    evaluatorVersion: EVALUATOR_VERSION, executionId: id, callId, status, durationSeconds: duration, agentVersion: version,
    scenario: session?.scenario ?? null, participantId: session?.participantId ?? null,
    transcriptHash: typeof raw.transcript === "string" && raw.transcript.trim() ? digest(raw.transcript) : null,
    source: snapshot ? { sha256: digest(snapshot), repository: snapshot.repository, pinnedSha: snapshot.pinnedSha,
      fetchedAt: snapshot.fetchedAt, label: snapshot.label, preCallContentBinding: "repository-SHA-only",
      confirmedTaskPrLinks: permittedTasks.filter(t => t.prNumber != null && snapshot.pullRequests.some(p => p.repository === snapshot.repository && p.number === t.prNumber)).length } : null,
    consentReference: consent ? digest(consent) : null,
    window: bounded ? { start: new Date(start!).toISOString(), end: new Date(end!).toISOString(), source: "local lifecycle receipts" } : null,
    tools: bounded ? tools.map(e => ({ at: e.at, tool: e.tool, ok: e.ok, evidenceIds: e.evidenceIds })) : null,
    excludedToolEvents: bounded ? allTools.length - tools.length : null,
    writes, checks,
  };
}
