import type { EvidenceSnapshot } from "../contracts";
import type { StoredEvent } from "../store/event-store";
import type { ClarificationTicket, Decision, LiveUtterance, SourceRef } from "./contracts";
import type { Actor } from "./identity";
import { loggedDecisions, tickets, utterances, zoneEvents } from "./state";

// LEFT — Team Memory. Answers only from APPROVED, authorized context. Anything
// else is said to be unconfirmed and offered as a leader clarification.
// Retrieved text is quoted as data; it is never executed or obeyed.

/** Base decisions derived from the approved meeting snapshot (Wispr lane). */
export function baseDecisions(snapshot: EvidenceSnapshot): Decision[] {
  return snapshot.tasks.map((t) => ({
    id: `dec:${t.id}`,
    topic: t.title,
    statement: t.title,
    state: t.assignment.state === "accepted" ? "approved" : t.assignment.state === "disputed" ? "disputed" : "proposed",
    ownerId: t.assignment.ownerId,
    version: 1,
    meetingId: t.meetingId,
    sources: t.passageIds.map((pid) => {
      const p = snapshot.passages.find((x) => x.id === pid);
      return { kind: "wispr_meeting" as const, id: pid, meetingId: t.meetingId, label: p ? `${p.speaker ?? "speaker"}: "${p.text.slice(0, 160)}"` : pid };
    }),
  }));
}

/** Current decision memory: snapshot base overlaid by verified leader resolutions. */
export function currentDecisions(snapshot: EvidenceSnapshot, events: StoredEvent[]): Decision[] {
  const logged = loggedDecisions(events);
  const merged = new Map<string, Decision>(baseDecisions(snapshot).map((d) => [d.id, d]));
  for (const [id, d] of logged) if (!merged.has(id) || d.version > merged.get(id)!.version) merged.set(id, d);
  return [...merged.values()];
}

export const visibleDecisions = (snapshot: EvidenceSnapshot, events: StoredEvent[], actor: Actor) =>
  currentDecisions(snapshot, events).filter((d) => actor.meetingIds.includes(d.meetingId));

const STOP = new Set("the a an is are was it to of and or for in on at by be do does did what when who whom which where how why we our us you your i me my this that with from have has will would should can could kya kab kaun kis hai tha ka ki ke ko se mein aur ya bhi agar wait sorry matlab actually umm uh hmm".split(" "));
export const terms = (s: string) =>
  [...new Set(s.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)))];

/**
 * Hinglish self-corrections: keep what follows the LAST correction marker.
 * "deadline kab hai — nahi, matlab owner kaun hai" -> "owner kaun hai".
 */
export function finalIntent(q: string): string {
  const parts = q.split(/\b(?:no wait|i mean|sorry,?|actually|nahi,? matlab|matlab|nahi nahi|scratch that)\b/i);
  const last = parts[parts.length - 1].replace(/^[\s,.\-—–]+/, "").trim();
  return last.length >= 6 ? last : q.trim();
}

export type MemoryAnswer =
  | { kind: "confirmed" | "conditional"; decision: Decision; speak: string; sources: SourceRef[]; offerEscalation: false }
  | { kind: "not_confirmed"; decision: Decision; speak: string; sources: SourceRef[]; offerEscalation: true; pendingTicket?: ClarificationTicket }
  | { kind: "unknown"; speak: string; sources: []; offerEscalation: true; pendingTicket?: ClarificationTicket };

export function askTeamMemory(snapshot: EvidenceSnapshot, events: StoredEvent[], actor: Actor, rawQuestion: string): MemoryAnswer & { provisional: LiveUtterance[]; question: string } {
  const question = finalIntent(rawQuestion);
  const q = terms(question);
  const decisions = visibleDecisions(snapshot, events, actor);
  const scored = decisions
    .map((d) => {
      const hay = terms(`${d.topic} ${d.statement} ${d.conditions ?? ""} ${d.sources.map((s) => s.label).join(" ")}`);
      return { d, score: q.filter((t) => hay.some((h) => h === t || (t.length > 4 && h.startsWith(t.slice(0, 5))))).length };
    })
    .filter((x) => x.score >= Math.min(2, Math.max(1, q.length)))
    .sort((a, b) => b.score - a.score || stateRank(b.d) - stateRank(a.d));

  const myOpen = [...tickets(events).values()].find(
    (t) => t.requesterId === actor.participant.id && t.state === "pending" && terms(t.question).filter((x) => q.includes(x)).length >= Math.min(2, q.length),
  );
  const provisional = visibleUtterances(events, actor).filter((u) => terms(u.text).filter((x) => q.includes(x)).length >= 2).slice(-2);
  const live = provisional.length ? ` There's also an unreviewed live remark on this, which is provisional and not a decision.` : "";

  const best = scored[0]?.d;
  if (!best) {
    return {
      kind: "unknown", question, provisional, sources: [], offerEscalation: true, pendingTicket: myOpen,
      speak: myOpen
        ? `I still don't have a confirmed answer. Your question to the leader is pending.${live}`
        : `I don't have a confirmed answer to that in the approved meeting notes. Want me to ask the leader?${live}`,
    };
  }
  const who = best.approvedBy ? ` — approved by ${nameOf(snapshot, best.approvedBy)}` : "";
  if (best.state === "approved")
    return { kind: "confirmed", decision: best, question, provisional, sources: best.sources, offerEscalation: false, speak: `Confirmed${who}: ${best.statement}.${live}` };
  if (best.state === "conditional")
    return { kind: "conditional", decision: best, question, provisional, sources: best.sources, offerEscalation: false, speak: `Only conditionally approved${who}: ${best.statement}, on condition that ${best.conditions}. It is not unconditional.${live}` };
  return {
    kind: "not_confirmed", decision: best, question, provisional, sources: best.sources, offerEscalation: true, pendingTicket: myOpen,
    speak: `${best.state === "disputed" ? "That's disputed" : "That was only proposed, not confirmed"}: ${best.statement}. ${myOpen ? "Your question to the leader is still pending." : "Want me to ask the leader to confirm?"}${live}`,
  };
}

const stateRank = (d: Decision) => ({ approved: 4, conditional: 3, proposed: 2, disputed: 1, superseded: 0 })[d.state];
export const nameOf = (s: EvidenceSnapshot, id: string) => s.participants.find((p) => p.id === id)?.name ?? "the leader";

// ---- live utterances visible to an actor ------------------------------------
export function visibleUtterances(events: StoredEvent[], actor: Actor): LiveUtterance[] {
  const revoked = new Set(
    zoneEvents(events, "consent").filter((e) => (e.data as { microphone: boolean }).microphone === false).map((e) => e.key),
  );
  const all = utterances(events).filter((u) => u.participantId === actor.participant.id || (u.visibility === "team" && !revoked.has(u.sessionId)));
  // Final supersedes provisional for the same utteranceId; order by session seq (not device clock).
  const byUtt = new Map<string, LiveUtterance>();
  for (const u of all) {
    const prev = byUtt.get(u.utteranceId);
    if (!prev || (u.isFinal && !prev.isFinal) || (u.isFinal === prev.isFinal && u.seq > prev.seq)) byUtt.set(u.utteranceId, u);
  }
  return [...byUtt.values()].sort((a, b) => a.sessionId.localeCompare(b.sessionId) || a.seq - b.seq);
}
