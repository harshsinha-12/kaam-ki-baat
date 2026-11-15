import { randomBytes } from "node:crypto";
import type { EvidenceSnapshot, Task } from "../contracts";
import { resolveCaller, type Caller } from "../auth/call-session";
import { markAttempted } from "../core/communication-ledger";
import { persistVerifiedUpdate } from "../core/persist-update";
import { short } from "../core/reconcile";
import type { Specialist } from "../core/spatial-specialists";
import type { EventStore } from "../store/event-store";
import { evidenceVerifier } from "../specialists/evidence-verifier";
import { handleTurn, startConversation, type Conversation } from "../specialists/orchestrator";
import { acknowledge, createTicket, deliveries, markDelivered } from "../zones/escalation";
import type { Actor } from "../zones/identity";
import { askTeamMemory, nameOf } from "../zones/memory";
import { contextVersion, latestActivatedZone } from "../zones/state";
import { getCodeGraph } from "../codegraph/load";
import { queryGraph } from "../codegraph/graph";

// The four runtime tools Bolna calls during a phone call (D-013). Framework-free:
// app/api/tools/[tool]/route.ts is a thin HTTP wrapper around these.

export interface Runtime {
  store: EventStore;
  snapshot: EvidenceSnapshot;
  conversations: Map<string, Conversation>;
}

export type ToolResponse = { status: number; body: Record<string, unknown> };
export const TOOL_NAMES = ["get_my_brief", "get_task_evidence", "get_changes", "record_task_update", "request_clarification"] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

export async function runTool(rt: Runtime, tool: ToolName, body: Record<string, unknown>): Promise<ToolResponse> {
  const auth = await resolveCaller(rt.store, rt.snapshot, body.call_token ?? body.callToken);
  if (!auth.ok) return { status: auth.status, body: { ok: false, error: auth.reason, speak: "I can't verify who I'm speaking with, so I can't share project details." } };
  const caller = auth.caller;
  const res = await dispatch(rt, tool, caller, body);
  // A clarification answer counts as acknowledged only when the caller explicitly
  // acknowledged it in the communication ledger (not merely because it was spoken).
  const conv = rt.conversations.get(caller.session.callId);
  for (const item of conv?.ledger.items ?? []) {
    if (item.id.startsWith("clar:") && item.acknowledged) await acknowledge(rt.store, callActor(caller), item.id.slice(5));
  }
  await rt.store.append({
    type: "tool_call",
    at: new Date().toISOString(),
    callId: caller.session.callId,
    tool,
    ok: res.status < 400 && res.body.ok !== false,
    summary: String(res.body.speak ?? res.body.error ?? "").slice(0, 300),
    evidenceIds: (res.body.evidenceIds as string[] | undefined) ?? [],
  });
  return res;
}

/** Phone callers are never leaders for privileged actions (no step-up on PSTN). */
export function callActor(caller: Caller): Actor {
  return {
    participant: caller.participant,
    role: caller.participant.role ?? "member",
    repoAccess: caller.participant.repoAccess ?? true,
    sessionId: caller.session.callId,
    channel: "call",
    stepUpFresh: false,
    meetingIds: caller.participant.meetingIds.filter((m) => caller.session.meetingIds.includes(m)),
  };
}

function pickTask(rt: Runtime, caller: Caller, requested?: unknown): Task | undefined {
  const mine = rt.snapshot.tasks.filter((t) => caller.taskIds.has(t.id));
  if (typeof requested === "string" && requested) return mine.find((t) => t.id === requested); // never another person's task
  const conv = rt.conversations.get(caller.session.callId);
  return mine.find((t) => t.id === conv?.focus.taskId) ?? mine.find((t) => t.assignment.state === "accepted") ?? mine[0];
}

async function dispatch(rt: Runtime, tool: ToolName, caller: Caller, body: Record<string, unknown>): Promise<ToolResponse> {
  const callId = caller.session.callId;
  switch (tool) {
    case "get_my_brief": {
      // Leader answers waiting for this person come first (delivery after reconnect).
      const actor = callActor(caller);
      const waiting = (await deliveries(rt.store, actor)).answered;
      const answerFacts = waiting.map((t) => ({
        id: `clar:${t.id}`,
        fact: `The leader answered your question "${t.question}": ${t.answer!.statement}${t.answer!.conditions ? `, on condition that ${t.answer!.conditions}` : ""} (approved by ${nameOf(rt.snapshot, t.answer!.approvedBy)}).`,
      }));
      for (const t of waiting) await markDelivered(rt.store, actor, t.id);
      const task = pickTask(rt, caller);
      if (!task) {
        const conv = startConversation(callId, caller.participant.id, null, answerFacts);
        for (const f of answerFacts) conv.ledger = markAttempted(conv.ledger, f.id);
        conv.lastSpokenFactIds = answerFacts.map((f) => f.id);
        rt.conversations.set(callId, conv);
        return ok({ speak: `Hi ${caller.participant.name}. ${answerFacts.map((f) => f.fact).join(" ")} ${answerFacts.length ? "" : "I don't see any task from the approved meeting assigned to you. "}Ask me about any team decision, or where the code is.`.replace(/\s+/g, " ").trim(), tasks: [], deliveredClarifications: waiting.map((t) => t.id), evidenceIds: waiting.map((t) => t.id) });
      }
      const meeting = rt.snapshot.meetings.find((m) => m.id === task.meetingId);
      const passage = rt.snapshot.passages.find((p) => task.passageIds.includes(p.id));
      const v = evidenceVerifier(rt.snapshot, task, await rt.store.latestUpdate(task.id));
      const facts = [
        { id: "decision", fact: `In "${meeting?.title ?? "the meeting"}", the team agreed: ${task.title}.` },
        { id: "status", fact: v.statements[0] ?? "There's no code evidence yet." },
        { id: "next", fact: v.statements.slice(1, 3).join(" ") || (task.prNumber == null ? "Next step: identify the matching repository or pull request before verifying this task." : "Next step: open the code and confirm it does what the meeting said.") },
      ];
      let conv = startConversation(callId, caller.participant.id, task.id, [...answerFacts, ...facts]);
      for (const f of answerFacts) conv.ledger = markAttempted(conv.ledger, f.id);
      conv.ledger = markAttempted(markAttempted(conv.ledger, "decision"), "status");
      conv.lastSpokenFactIds = [...answerFacts.map((f) => f.id), "decision", "status"];
      conv.cards.evidence_verifier = { ...conv.cards.evidence_verifier, status: "has_reply", summary: v.statements.join(" ") };
      rt.conversations.set(callId, conv);
      return ok({
        speak: `Hi ${caller.participant.name}. ${answerFacts.map((f) => f.fact).join(" ")} ${facts[0].fact} ${facts[1].fact} ${task.prNumber == null ? "Want me to check this repository for a possible code match?" : "Want me to show you exactly where the code is?"}`.replace(/\s+/g, " "),
        deliveredClarifications: waiting.map((t) => t.id),
        task: { id: task.id, title: task.title, ownership: v.reconciled.ownership, pr: v.reconciled.pr, checks: v.reconciled.checks, sha: short(v.reconciled.currentSha) },
        source: { meetingId: task.meetingId, passageId: passage?.id, speaker: passage?.speaker, label: rt.snapshot.label },
        pending: ["next"],
        evidenceIds: [...task.passageIds, ...(v.reconciled.prNumber ? [`pr:${v.reconciled.prNumber}`] : [])],
      });
    }
    case "get_task_evidence": {
      const task = pickTask(rt, caller, body.task_id ?? body.taskId);
      if ((body.task_id ?? body.taskId) && !task) return { status: 403, body: { ok: false, error: "task not authorized", speak: "That task isn't one I can share with you." } };
      // No explicit focus? Follow the zone the caller activated on screen (camera/keyboard selection).
      if (body.focus === undefined || body.focus === "") {
        const z = latestActivatedZone(await rt.store.all(), caller.participant.id);
        if (z === "team_memory") body = { ...body, focus: "memory", focusSource: "screen" };
        else if (z === "code_navigator") body = { ...body, focus: "code", focusSource: "screen" };
      }
      if (body.focus === "code" || body.focus === "graph") {
        const actor = callActor(caller);
        if (!actor.repoAccess) return { status: 403, body: { ok: false, error: "no repository access", speak: "I can't show code to you." } };
        const g = getCodeGraph(rt.snapshot);
        const pr = task?.prNumber == null ? undefined : rt.snapshot.pullRequests.find(p => p.repository === rt.snapshot.repository && p.number === task.prNumber);
        const a = queryGraph(g, String(body.question ?? body.utterance ?? ""), rt.snapshot.files, new Set(pr?.changedFiles ?? []));
        const file = a.seed ? a.seed.path.split("/").pop() : "";
        const caller2 = a.path.find((p) => p.via === "uses");
        const test = a.path.find((p) => p.via === "tests");
        const speak = a.seed
          ? `Open ${file}, the ${a.seed.label} ${a.seed.kind}, line ${a.seed.line}.${caller2 ? ` A static link suggests a caller in ${caller2.node.path.split("/").pop()}.` : ""}${test ? ` A related test file is ${test.node.path.split("/").pop()}; its execution is unverified.` : ""} That's my best match, not confirmed yet.`
          : "I couldn't find that in the code at this commit. Tell me a function or file name.";
        return ok({
          speak, specialist: "code_navigator", focusSource: body.focusSource ?? "caller",
          match: a.match, explanation: a.explanation, sha: g.sha,
          location: a.seed ? { path: a.seed.path, line: a.seed.line, url: `https://github.com/${g.repository}/blob/${g.sha}/${a.seed.path}#L${a.seed.line}` } : null,
          evidenceIds: a.subgraph.nodes,
        });
      }
      if (body.focus === "memory" || body.focus === "team_memory") {
        const events = await rt.store.all();
        const a = askTeamMemory(rt.snapshot, events, callActor(caller), String(body.question ?? body.utterance ?? ""));
        return ok({
          speak: a.speak, specialist: "team_memory", kind: a.kind, focusSource: body.focusSource ?? "caller", offerEscalation: a.offerEscalation,
          sources: a.sources, contextVersion: contextVersion(events), pendingTicket: "pendingTicket" in a ? a.pendingTicket?.id ?? null : null,
          evidenceIds: a.sources.map((x) => x.id),
        });
      }
      const conv = rt.conversations.get(callId) ?? startConversation(callId, caller.participant.id, task?.id ?? null, []);
      const focus = parseFocus(body.focus);
      const utterance = String(body.question ?? body.utterance ?? "");
      const r = handleTurn(conv, rt.snapshot, task, task ? await rt.store.latestUpdate(task.id) : null, { utterance, focus });
      rt.conversations.set(callId, r.conversation);
      const card = r.conversation.cards[r.specialist];
      return ok({
        speak: r.spoken,
        specialist: r.specialist,
        taskId: r.conversation.focus.taskId,
        contextVersion: r.conversation.focus.contextVersion,
        steps: r.navigation?.steps,
        evidence: card.evidence,
        evidenceIds: card.evidence.map((e) => e.id),
        snapshot: { label: rt.snapshot.label, repository: rt.snapshot.repository, pinnedSha: rt.snapshot.pinnedSha },
      });
    }
    case "get_changes": {
      const since = typeof body.since === "string" ? body.since : new Date(Date.now() - 24 * 3600_000).toISOString();
      const events = (await rt.store.all()).filter((e) => e.type === "task_update" && caller.taskIds.has(e.record.taskId));
      const changes = events
        .map((e, i) => ({ e, prev: events.slice(0, i).reverse().find((p) => p.type === "task_update" && e.type === "task_update" && p.record.taskId === e.record.taskId) }))
        .filter(({ e }) => e.at > since)
        .map(({ e, prev }) => e.type === "task_update" && ({
          taskId: e.record.taskId, status: e.record.status, previous: prev?.type === "task_update" ? prev.record.status : "none", at: e.at, recordId: e.record.id,
        }))
        .filter(Boolean);
      return ok({
        speak: changes.length ? `${changes.length} update${changes.length > 1 ? "s" : ""} since then.` : "Nothing has changed on your tasks since then.",
        since, changes, snapshotFetchedAt: rt.snapshot.fetchedAt, evidenceIds: [],
      });
    }
    case "request_clarification": {
      // Only after the caller explicitly agreed to send the question to the leader.
      const x = await createTicket(rt.store, rt.snapshot, callActor(caller), body);
      if (!x.ok) return { status: x.status, body: { ok: false, error: x.reason, speak: `I didn't send it — ${x.reason}.` } };
      return ok({
        ticketId: x.ticket.id, replayed: x.replayed, state: x.ticket.state,
        speak: x.ticket.answer
          ? `That question was already saved and the leader has answered: ${x.ticket.answer.statement}${x.ticket.answer.conditions ? `, on condition that ${x.ticket.answer.conditions}` : ""}.`
          : x.ticket.state === "withdrawn" ? "That question was previously saved and has been withdrawn. I haven't opened another ticket."
          : "Saved and read back. Your question is pending for the leader. I won't guess the answer; ask for it again after it's approved.",
        evidenceIds: [x.ticket.id],
      });
    }
    case "record_task_update": {
      const blocked = new Map<string, string>();
      for (const t of rt.snapshot.tasks) {
        if (t.assignment.state !== "accepted" || !t.assignment.ownerId) blocked.set(t.id, "ownership is not established, so I won't record a status");
        else if (t.assignment.ownerId !== caller.participant.id) blocked.set(t.id, "this task belongs to someone else");
      }
      const raw = { ...body, taskId: body.task_id ?? body.taskId ?? pickTask(rt, caller)?.id };
      const result = await persistVerifiedUpdate({
        raw, trustedActorId: caller.participant.id, callId, authorizedTaskIds: caller.taskIds, blockedTaskIds: blocked,
        repository: rt.store, generateId: () => `upd_${randomBytes(6).toString("hex")}`,
      });
      const conv = rt.conversations.get(callId);
      if (!result.saved) {
        if (conv) conv.cards.evidence_verifier = { ...conv.cards.evidence_verifier, status: "error", summary: `Not saved: ${result.reason}` };
        return { status: 409, body: { ok: false, saved: false, reason: result.reason, speak: `I couldn't save that — ${result.reason}. I don't have a verified saved update.` } };
      }
      if (conv) {
        conv.focus = { ...conv.focus, contextVersion: conv.focus.contextVersion + 1 };
        conv.cards.evidence_verifier = { ...conv.cards.evidence_verifier, status: "has_reply", summary: `Saved and read back: ${result.readBack.status} (${result.recordId}).`,
          evidence: [...conv.cards.evidence_verifier.evidence.filter((e) => !e.id.startsWith("upd_")), { id: result.recordId, label: `saved: ${result.readBack.status} · read back` }] };
      }
      return ok({
        saved: true, recordId: result.recordId, replayed: result.replayed, readBack: result.readBack,
        speak: `Saved. I marked it ${result.readBack.status.replace("_", " ")} and read it back from the store.`,
        evidenceIds: [result.recordId],
      });
    }
  }
}

const ok = (body: Record<string, unknown>): ToolResponse => ({ status: 200, body: { ok: true, ...body } });
const FOCI: Record<string, Specialist> = { find: "code_scout", code_scout: "code_scout", locate: "fix_navigator", fix_navigator: "fix_navigator", verify: "evidence_verifier", evidence_verifier: "evidence_verifier" };
const parseFocus = (f: unknown): Specialist | undefined => (typeof f === "string" ? FOCI[f] : undefined);
