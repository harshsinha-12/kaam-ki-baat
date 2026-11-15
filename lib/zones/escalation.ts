import { randomBytes } from "node:crypto";
import type { EvidenceSnapshot } from "../contracts";
import type { EventStore } from "../store/event-store";
import type { ClarificationTicket, Decision, TicketState } from "./contracts";
import { zoneAccess } from "./focus";
import type { Actor } from "./identity";
import { askTeamMemory, currentDecisions } from "./memory";
import { contextVersion, ev, leaderPresence, tickets } from "./state";

// Unknown answer -> requester-approved ticket -> leader resolves (verified write)
// -> requester receives the answer with provenance. A ticket is never dropped and
// never answered by a model: only an authenticated, stepped-up leader resolves it.

type Fail = { ok: false; status: 400 | 403 | 404 | 409; reason: string };

const NEXT: Record<TicketState, TicketState[]> = {
  pending: ["answered", "withdrawn"],
  answered: ["delivered", "acknowledged"],
  delivered: ["acknowledged"],
  acknowledged: [],
  withdrawn: [],
};

export async function createTicket(
  store: EventStore,
  snapshot: EvidenceSnapshot,
  actor: Actor,
  body: Record<string, unknown>,
): Promise<{ ok: true; ticket: ClarificationTicket; replayed: boolean } | Fail> {
  const question = String(body.question ?? "").trim();
  const key = String(body.idempotency_key ?? body.idempotencyKey ?? "");
  if (body.confirmed !== true && body.confirmed !== "true") return { ok: false, status: 400, reason: "the requester must approve sending this question to the leader" };
  if (question.length < 5 || question.length > 300) return { ok: false, status: 400, reason: "question must be 5–300 characters" };
  if (key.length < 8) return { ok: false, status: 400, reason: "idempotency_key (8+ chars) required" };
  const meetingId = actor.meetingIds[0];
  if (!meetingId) return { ok: false, status: 403, reason: "no approved meeting for this person" };

  const events = await store.all();
  const mem = askTeamMemory(snapshot, events, actor, question);
  if (mem.kind === "confirmed") return { ok: false, status: 409, reason: "that already has a confirmed answer" };
  const decision = "decision" in mem ? mem.decision : undefined;

  return store.appendGuarded<{ ok: true; ticket: ClarificationTicket; replayed: boolean } | Fail>((log) => {
    const existing = [...tickets(log).values()].find((t) => (t as ClarificationTicket & { idempotencyKey?: string }).idempotencyKey === key && t.requesterId === actor.participant.id);
    if (existing) {
      if (existing.question !== mem.question.slice(0, 300) || existing.meetingId !== (decision?.meetingId ?? meetingId))
        return { reject: { ok: false, status: 409, reason: "idempotency key was already used for a different question" } };
      return { reject: { ok: true as const, ticket: existing, replayed: true } };
    }
    const ticket: ClarificationTicket & { idempotencyKey: string } = {
      id: `clar_${randomBytes(5).toString("hex")}`,
      requesterId: actor.participant.id,
      question: mem.question.slice(0, 300),
      meetingId: decision?.meetingId ?? meetingId,
      contextRefs: (decision?.sources ?? []).map((s) => ({ ...s, label: s.label.slice(0, 120) })),
      decisionId: decision?.id,
      state: "pending",
      createdAt: new Date().toISOString(),
      leaderCall: { status: "not_requested", at: new Date().toISOString() },
      idempotencyKey: key,
    };
    return { append: ev("ticket", ticket.id, ticket), result: { ok: true as const, ticket, replayed: false } };
  });
}

export async function leaderInbox(store: EventStore, snapshot: EvidenceSnapshot, actor: Actor) {
  const access = zoneAccess(actor, "leader_desk");
  if (!access.allowed) return { ok: false as const, status: 403 as const, reason: access.reason };
  const events = await store.all();
  const all = [...tickets(events).values()].filter((t) => actor.meetingIds.includes(t.meetingId));
  const decisions = currentDecisions(snapshot, events);
  return {
    ok: true as const,
    contextVersion: contextVersion(events),
    pending: all.filter((t) => t.state === "pending").map((t) => ({ ...t, requesterName: snapshot.participants.find((p) => p.id === t.requesterId)?.name, decision: decisions.find((d) => d.id === t.decisionId) ?? null })),
    recent: all.filter((t) => t.state !== "pending").slice(-10),
  };
}

export type ResolveResult =
  | { ok: true; decision: Decision; ticket: ClarificationTicket; contextVersion: number; readBack: true }
  | Fail;

export async function resolveTicket(store: EventStore, snapshot: EvidenceSnapshot, actor: Actor, body: Record<string, unknown>): Promise<ResolveResult> {
  const access = zoneAccess(actor, "leader_desk");
  if (!access.allowed) return { ok: false, status: 403, reason: access.reason };
  if (body.confirmed !== true && body.confirmed !== "true") return { ok: false, status: 400, reason: "leader must explicitly confirm the answer" };
  const ticketId = String(body.ticket_id ?? body.ticketId ?? "");
  const statement = String(body.statement ?? "").trim();
  const conditions = typeof body.conditions === "string" && body.conditions.trim() ? body.conditions.trim().slice(0, 300) : undefined;
  if (statement.length < 3 || statement.length > 400) return { ok: false, status: 400, reason: "statement must be 3–400 characters" };
  const expectedVersion = body.expected_version ?? body.expectedVersion;
  if (typeof expectedVersion !== "number" || !Number.isSafeInteger(expectedVersion) || expectedVersion < 0)
    return { ok: false, status: 400, reason: "expected_version must be the current nonnegative decision version" };

  const result = await store.appendGuarded<ResolveResult>((log) => {
    const t = tickets(log).get(ticketId);
    if (!t || !actor.meetingIds.includes(t.meetingId)) return { reject: { ok: false, status: 404, reason: "no such ticket" } };
    if (t.state !== "pending") return { reject: { ok: false, status: 409, reason: `ticket is already ${t.state}` } };
    const decisionId = t.decisionId ?? `dec:${t.id}`;
    const current = currentDecisions(snapshot, log).find((d) => d.id === decisionId);
    const currentVersion = current?.version ?? 0;
    if (expectedVersion !== currentVersion)
      return { reject: { ok: false, status: 409, reason: `decision changed (now v${currentVersion}); reload before approving` } };
    const at = new Date().toISOString();
    const decision: Decision = {
      id: decisionId,
      topic: current?.topic ?? t.question,
      statement,
      conditions,
      state: conditions ? "conditional" : "approved",
      ownerId: current?.ownerId,
      version: currentVersion + 1,
      meetingId: t.meetingId,
      approvedBy: actor.participant.id,
      approvedAt: at,
      sources: [...(current?.sources ?? t.contextRefs), { kind: "leader_resolution", id: t.id, label: `Leader resolution of "${t.question.slice(0, 80)}"` }],
    };
    const answered: ClarificationTicket = {
      ...t, state: "answered",
      answer: { decisionId, decisionVersion: decision.version, statement, conditions, approvedBy: actor.participant.id, approvedAt: at },
    };
    return {
      // One durable log record keeps the decision and ticket together even if
      // an append fails. Both projections read this same resolution event.
      append: ev("resolution", t.id, { decision, ticket: answered }, at),
      result: { ok: true, decision, ticket: answered, contextVersion: 0, readBack: true },
    };
  });
  if (!result.ok) return result;

  // Read-back from the persisted log before anyone is told it was saved.
  const after = await store.all();
  const persisted = currentDecisions(snapshot, after).find((d) => d.id === result.decision.id);
  const persistedTicket = tickets(after).get(result.ticket.id);
  if (!persisted || persisted.version !== result.decision.version || persisted.statement !== statement || persistedTicket?.state !== "answered")
    return { ok: false, status: 409, reason: "read-back failed; the answer was not confirmed as saved" };
  return { ...result, decision: persisted, ticket: persistedTicket, contextVersion: contextVersion(after) };
}

type TransitionResult = { ok: true; ticket: ClarificationTicket; replayed: boolean } | { ok: false; reason: string };
async function transition(store: EventStore, actor: Actor, ticketId: string, to: TicketState, ownerOnly = true): Promise<TransitionResult> {
  return store.appendGuarded<TransitionResult>((log) => {
    const t = tickets(log).get(ticketId);
    if (!t || !actor.meetingIds.includes(t.meetingId) || (ownerOnly && t.requesterId !== actor.participant.id)) return { reject: { ok: false as const, reason: "no such ticket" } };
    if (t.state === to) return { reject: { ok: true as const, ticket: t, replayed: true } };
    if (!NEXT[t.state].includes(to)) return { reject: { ok: false as const, reason: `cannot go from ${t.state} to ${to}` } };
    const next = { ...t, state: to };
    return { append: ev("ticket", t.id, next), result: { ok: true as const, ticket: next, replayed: false } };
  });
}

/** Answers waiting for the requester (works after reconnect: it's all in the log). */
export async function deliveries(store: EventStore, actor: Actor) {
  const ts = [...tickets(await store.all()).values()].filter((t) => t.requesterId === actor.participant.id && actor.meetingIds.includes(t.meetingId));
  return { answered: ts.filter((t) => t.state === "answered" || t.state === "delivered"), pending: ts.filter((t) => t.state === "pending") };
}
export const markDelivered = (store: EventStore, actor: Actor, id: string) => transition(store, actor, id, "delivered");
export const acknowledge = (store: EventStore, actor: Actor, id: string) => transition(store, actor, id, "acknowledged");
export const withdraw = (store: EventStore, actor: Actor, id: string) => transition(store, actor, id, "withdrawn");

/**
 * Ask for an optional Bolna clarification call to the leader. We never place it
 * unless the leader is marked available AND has consented to calls; otherwise
 * the ticket simply stays pending. Placing the call itself is an operator step.
 */
export async function requestLeaderCall(store: EventStore, snapshot: EvidenceSnapshot, actor: Actor, ticketId: string) {
  const leader = snapshot.participants.find((p) => p.role === "leader" && actor.meetingIds.some((m) => p.meetingIds.includes(m)));
  type CallResult = { ok: true; status: "unavailable" | "no_consent" | "requested"; ticket: ClarificationTicket } | { ok: false; reason: string };
  return store.appendGuarded<CallResult>((log) => {
    const t = tickets(log).get(ticketId);
    if (!t || t.requesterId !== actor.participant.id || !actor.meetingIds.includes(t.meetingId)) return { reject: { ok: false as const, reason: "no such ticket" } };
    if (t.state !== "pending") return { reject: { ok: false as const, reason: `ticket is ${t.state}` } };
    const presence = leader ? leaderPresence(log, leader.id) : { available: false, callConsent: false };
    const status: "unavailable" | "no_consent" | "requested" = !leader || !presence.available ? "unavailable" : !presence.callConsent ? "no_consent" : "requested";
    const next: ClarificationTicket = { ...t, leaderCall: { status, at: new Date().toISOString() } };
    return { append: ev("ticket", t.id, next), result: { ok: true as const, status, ticket: next } };
  });
}

export async function setPresence(store: EventStore, actor: Actor, body: Record<string, unknown>) {
  if (actor.role !== "leader") return { ok: false as const, reason: "only the leader sets leader availability" };
  const data = { available: body.available === true, callConsent: body.call_consent === true || body.callConsent === true };
  await store.append(ev("presence", actor.participant.id, data));
  return { ok: true as const, ...data };
}
