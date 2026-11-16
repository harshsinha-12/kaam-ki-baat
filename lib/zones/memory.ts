import type { EvidenceSnapshot } from "../contracts";
import type { StoredEvent } from "../store/event-store";
import type { ClarificationTicket, Decision, LiveUtterance, SourceRef } from "./contracts";
import type { Actor } from "./identity";
import { latestConsent, loggedDecisions, tickets, utterances } from "./state";
import { meetingContext, meetingSource, visibleMeetingPassages } from "./meeting-context";

// LEFT — Team Memory. Answers only from APPROVED, authorized context. Anything
// else is said to be unconfirmed and offered as a leader clarification.
// Retrieved text is quoted as data; it is never executed or obeyed.

/** Base decisions derived from the approved meeting snapshot (Wispr lane). */
export function baseDecisions(snapshot: EvidenceSnapshot): Decision[] {
  return snapshot.tasks.map((t) => {
    const approvedMeeting = snapshot.meetings.some(m => m.id === t.meetingId && m.approvedBy.trim());
    const passages = snapshot.passages.filter(p => t.passageIds.includes(p.id) && p.meetingId === t.meetingId);
    return {
    id: `dec:${t.id}`,
    topic: t.title,
    statement: t.title,
    state: t.assignment.state === "accepted" && approvedMeeting && passages.length > 0 ? "approved" : t.assignment.state === "disputed" ? "disputed" : "proposed",
    ownerId: t.assignment.ownerId,
    version: 1,
    meetingId: t.meetingId,
    sources: passages.map((p) => {
      return meetingSource(snapshot, p);
    }),
  } as Decision;
  });
}

/** Current decision memory: snapshot base overlaid by verified leader resolutions. */
export function currentDecisions(snapshot: EvidenceSnapshot, events: StoredEvent[]): Decision[] {
  const logged = loggedDecisions(events);
  const merged = new Map<string, Decision>(baseDecisions(snapshot).map((d) => [d.id, d]));
  for (const [id, d] of logged) if (!merged.has(id) || d.version > merged.get(id)!.version) merged.set(id, d);
  return [...merged.values()];
}

export const visibleDecisions = (snapshot: EvidenceSnapshot, events: StoredEvent[], actor: Actor) => {
  const visible = new Set(visibleMeetingPassages(snapshot, actor).map(p => JSON.stringify([p.meetingId, p.id])));
  return currentDecisions(snapshot, events).filter((d) => actor.meetingIds.includes(d.meetingId) && snapshot.meetings.some(m => m.id === d.meetingId && m.approvedBy.trim())).flatMap(d => {
    const sources = d.sources.filter(ref => {
      if (ref.kind !== "wispr_meeting") return true;
      return visible.has(JSON.stringify([d.meetingId, ref.id]));
    });
    return d.sources.length > 0 && sources.length === 0 ? [] : [{ ...d, sources }];
  });
};

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
  | { kind: "meeting_context"; speak: string; sources: SourceRef[]; offerEscalation: true; pendingTicket?: ClarificationTicket }
  | { kind: "confirmed" | "conditional"; decision: Decision; speak: string; sources: SourceRef[]; offerEscalation: false }
  | { kind: "not_confirmed"; decision: Decision; speak: string; sources: SourceRef[]; offerEscalation: true; pendingTicket?: ClarificationTicket }
  | { kind: "unknown"; speak: string; sources: []; offerEscalation: true; pendingTicket?: ClarificationTicket };

export function askTeamMemory(snapshot: EvidenceSnapshot, events: StoredEvent[], actor: Actor, rawQuestion: string, meetingId?: string): MemoryAnswer & { provisional: LiveUtterance[]; question: string } & ReturnType<typeof meetingContext> {
  const question = finalIntent(rawQuestion);
  const scope = meetingId ? { ...actor, meetingIds: actor.meetingIds.filter(id => id === meetingId) } : actor;
  const context = meetingContext(snapshot, scope, question, meetingId);
  return { ...answerTeamMemory(snapshot, events, scope, question, context), ...context };
}

// Everyday words people use for the things meetings decide. Small and inspectable;
// each entry maps a spoken word to words a decision or passage would contain.
const MEMORY_WORDS: Record<string, string[]> = {
  video: ["film", "record"], film: ["video", "record"], recording: ["film", "record"],
  stop: ["freeze"], merging: ["freeze", "merge"], cutoff: ["freeze"], helper: ["agent"], repository: ["code", "graph", "repo"],
  side: ["left", "right"], swap: ["move"],
};
const stemW = (w: string) => (w.length > 4 ? w.replace(/(ings|ing|ies|es|ed|s)$/, "") : w);
const near = (t: string, h: string) => h === t || (t.length > 4 && h.startsWith(t.slice(0, 5)));

/**
 * Score decisions by the words they share with the question. Rare words count
 * more (inverse document frequency over the visible decisions) and everyday
 * synonyms count at a discount, so a reworded question can still find its
 * decision while a question about something never discussed scores too low.
 */
function scoreDecisions(question: string, decisions: Decision[]) {
  const q = terms(question).map(stemW);
  const expanded = new Map<string, number>(q.map((t) => [t, 1]));
  for (const t of terms(question)) for (const s of MEMORY_WORDS[t] ?? []) if (!expanded.has(stemW(s))) expanded.set(stemW(s), 0.6);
  const docs = decisions.map((d) => ({ d, hay: terms(`${d.topic} ${d.statement} ${d.conditions ?? ""} ${d.sources.map((s) => s.label).join(" ")}`).map(stemW) }));
  const df = (t: string) => docs.filter((x) => x.hay.some((h) => near(t, h))).length;
  const N = Math.max(1, docs.length);
  return docs.map(({ d, hay }) => {
    let score = 0, matched = 0, viaSynonym = 0;
    for (const [t, w] of expanded) if (hay.some((h) => near(t, h))) { score += w * Math.log(1 + N / Math.max(1, df(t))); if (w === 1) matched++; else viaSynonym++; }
    return { d, score, matched, viaSynonym, qLen: q.length };
  });
}

function answerTeamMemory(snapshot: EvidenceSnapshot, events: StoredEvent[], actor: Actor, question: string, context: ReturnType<typeof meetingContext>): MemoryAnswer & { provisional: LiveUtterance[]; question: string } {
  const q = terms(question);
  const decisions = visibleDecisions(snapshot, events, actor);
  // Accept a decision when two question words match, or one rare word plus a synonym.
  const scored = scoreDecisions(question, decisions)
    .filter((x) => x.matched >= Math.min(2, Math.max(1, x.qLen)) || (x.matched >= 1 && x.viaSynonym >= 1 && x.score >= 1.6))
    .sort((a, b) => b.score - a.score || stateRank(b.d) - stateRank(a.d));

  const myOpen = [...tickets(events).values()].find(
    (t) => t.requesterId === actor.participant.id && actor.meetingIds.includes(t.meetingId) && t.state === "pending" && q.length > 0 && terms(t.question).filter((x) => q.includes(x)).length >= Math.min(2, q.length),
  );
  const provisional = visibleUtterances(events, actor).filter((u) => terms(u.text).filter((x) => q.includes(x)).length >= 2).slice(-2);
  const live = provisional.length ? ` There's also an unreviewed live remark on this, which is provisional and not a decision.` : "";

  const best = scored[0]?.d;
  if (!best) {
    if (context.passages.length) {
      const p = context.passages[0];
      return { kind: "meeting_context", question, provisional, sources: context.passages.map(p => p.source), offerEscalation: true, pendingTicket: myOpen,
        speak: `In ${p.source.meetingTitle}, ${p.speaker ?? "an unidentified speaker"} said: “${p.text.slice(0, 500)}”${p.text.length > 500 ? " (excerpt)" : ""}. This is recorded meeting context; I don't have a confirmed decision for this question.${live}` };
    }
    return {
      kind: "unknown", question, provisional, sources: [], offerEscalation: true, pendingTicket: myOpen,
      speak: myOpen
        ? `I still don't have a confirmed answer. Your question to the leader is pending.${live}`
        : `I don't have a confirmed answer to that in the approved meeting notes. Want me to ask the leader?${live}`,
    };
  }
  const who = best.approvedBy ? `, approved by ${nameOf(snapshot, best.approvedBy)}` : "";
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
  const all = utterances(events).filter((u) => {
    if (!u.meetingId || !actor.meetingIds.includes(u.meetingId)) return false;
    if (u.participantId === actor.participant.id) return true;
    const consent = latestConsent(events, u.sessionId);
    return u.visibility === "team" && consent?.microphone === true && consent.shareWithTeam === true;
  });
  // Final supersedes provisional for the same utteranceId; order by session seq (not device clock).
  const byUtt = new Map<string, LiveUtterance>();
  for (const u of all) {
    const key = JSON.stringify([u.sessionId, u.utteranceId]);
    const prev = byUtt.get(key);
    if (!prev || (u.isFinal && !prev.isFinal) || (u.isFinal === prev.isFinal && u.seq > prev.seq)) byUtt.set(key, u);
  }
  return [...byUtt.values()].sort((a, b) => a.sessionId.localeCompare(b.sessionId) || a.seq - b.seq);
}
