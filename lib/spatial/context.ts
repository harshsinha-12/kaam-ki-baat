import type { Caller } from "../auth/call-session";
import type { Runtime } from "../tools/runtime";
import { SPECIALISTS } from "../core/spatial-specialists";
import type { PageState, SpatialContext } from "./contracts";

export const emptyPage = (): PageState => ({ space: "meeting", selectedEvidence: null, visibleTargets: [] });

export function buildSpatialContext(rt: Runtime, caller: Caller, page = emptyPage(), connected = false): SpatialContext {
  const s = rt.snapshot;
  const tasks = s.tasks.filter(t => caller.taskIds.has(t.id) && s.meetings.some(m => m.id === t.meetingId && !!m.approvedBy));
  const conv = rt.conversations.get(caller.session.callId);
  // Do not expose a conversation if its current task no longer belongs to this
  // caller. In particular, a browser may not select somebody else's callId.
  const allowed = conv?.participantId === caller.participant.id && !!conv.focus.taskId && tasks.some(t => t.id === conv.focus.taskId);
  const task = tasks.find(t => t.id === (allowed ? conv?.focus.taskId : undefined)) ?? tasks[0];
  const passages = s.passages.filter(p => task?.passageIds.includes(p.id) && p.meetingId === task.meetingId &&
    caller.session.meetingIds.includes(p.meetingId) && caller.participant.meetingIds.includes(p.meetingId));
  const cards = Object.entries(SPECIALISTS).map(([id, spec]) => {
    const card = allowed ? conv?.cards[id as keyof typeof SPECIALISTS] : undefined;
    return { id: id as keyof typeof SPECIALISTS, label: spec.label, summary: card?.summary ?? spec.purpose, evidence: card?.evidence ?? [] };
  });
  const targets: SpatialContext["targets"] = [
    { id: "meeting", label: "Meeting context · left", space: "meeting" },
    { id: "code", label: "Codebase · right", space: "code" },
    ...cards.map(c => ({ id: c.id, label: c.label, space: "code" as const })),
    ...cards.flatMap(c => c.evidence.map(e => ({ id: e.id, label: e.label, space: "code" as const }))),
  ];
  const safePage = {
    space: page.space,
    selectedEvidence: targets.some(t => t.id === page.selectedEvidence) ? page.selectedEvidence : null,
    visibleTargets: page.visibleTargets.filter(id => targets.some(t => t.id === id)),
  };
  return {
    callId: caller.session.callId,
    snapshot: { label: s.label, repository: s.repository, pinnedSha: s.pinnedSha, fetchedAt: s.fetchedAt },
    page: safePage, connected,
    task: task ? { id: task.id, title: task.title, ownership: task.assignment.state } : null,
    meetings: s.meetings.filter(m => m.id === task?.meetingId && m.approvedBy && passages.length > 0).map(m => ({
      id: m.id, title: m.title, source: m.source, passages,
    })),
    cards,
    findings: allowed ? conv!.findings.filter(f => f.repository === s.repository && f.commitSha === s.pinnedSha) : [],
    turns: allowed ? conv!.turns.slice(-6) : [],
    outstanding: allowed ? conv!.ledger.items.filter(i => !i.acknowledged) : [],
    targets,
  };
}
