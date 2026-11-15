import type { EvidenceSnapshot } from "../contracts";
import type { EventStore } from "../store/event-store";
import { navigateCode } from "./code";
import { acknowledge, createTicket, deliveries, leaderInbox, markDelivered, requestLeaderCall, resolveTicket, setPresence, withdraw } from "./escalation";
import { activateZone, readFocusInput, recordFocus, recordFocusInputStatus, selectFocusInput, zoneAccess } from "./focus";
import { hmacCodeVerifier, resolveDeviceActor, stepUp, type StepUpVerifier } from "./identity";
import { ingestUtterance, setConsent } from "./live";
import { askTeamMemory, nameOf } from "./memory";
import { contextVersion, focusState, latestConsent } from "./state";
import { assertPasskey, issueChallenge, registerPasskey } from "./webauthn";
import { getCodeGraph } from "../codegraph/load";
import { queryGraph } from "../codegraph/graph";
import { explainFirstPrinciples } from "../codegraph/explain";
import { understand } from "../core/understand";
import { ev, zoneEvents } from "./state";

// Framework-free dispatcher for the browser / native companion API
// (app/api/zones/[action]/route.ts). Deny by default: every action resolves the
// actor from a server-issued device session token first.

export interface ZoneRuntime {
  store: EventStore;
  snapshot: EvidenceSnapshot;
  stepUpVerifier?: StepUpVerifier;
}

export const ZONE_ACTIONS = [
  "me", "focus", "focus-input", "focus-input-status", "activate", "consent", "utterance", "memory_ask", "ticket_create", "ticket_withdraw", "ticket_call_leader",
  "deliveries", "delivery_seen", "delivery_ack", "code_navigate", "leader_step_up", "leader_presence", "leader_inbox", "leader_resolve",
  "passkey_options", "passkey_register", "passkey_assert", "code_graph_query", "code_focus", "understand",
] as const;
export type ZoneAction = (typeof ZONE_ACTIONS)[number];

export async function runZoneAction(rt: ZoneRuntime, action: ZoneAction, token: unknown, body: Record<string, unknown>): Promise<{ status: number; body: Record<string, unknown> }> {
  const auth = await resolveDeviceActor(rt.store, rt.snapshot, token);
  if (!auth.ok) return { status: auth.status, body: { ok: false, error: auth.reason } };
  const actor = auth.actor;
  const r = (status: number, b: object) => ({ status, body: b as Record<string, unknown> });
  const fail = (x: { ok: false; status?: number; reason: string }) => r(x.status ?? 400, { ok: false, error: x.reason });

  switch (action) {
    case "me": {
      const events = await rt.store.all();
      return r(200, {
        ok: true,
        participant: { id: actor.participant.id, name: actor.participant.name },
        role: actor.role,
        stepUpFresh: actor.stepUpFresh,
        zones: Object.fromEntries((["team_memory", "leader_desk", "code_navigator"] as const).map((z) => [z, zoneAccess(actor, z)])),
        focus: focusState(events, actor.sessionId),
        consent: latestConsent(events, actor.sessionId),
        contextVersion: contextVersion(events),
        snapshot: { label: rt.snapshot.label, repository: rt.snapshot.repository, pinnedSha: rt.snapshot.pinnedSha },
      });
    }
    case "focus-input": { const x = Object.keys(body).length ? await selectFocusInput(rt.store, actor, body) : await readFocusInput(rt.store, actor); return x.ok ? r(200, x) : fail(x); }
    case "focus-input-status": { const x = await recordFocusInputStatus(rt.store, actor, body); return x.ok ? r(200, x) : fail(x); }
    case "focus": { const x = await recordFocus(rt.store, actor, body); return x.ok ? r(200, x) : fail(x); }
    case "activate": { const x = await activateZone(rt.store, actor, body); return x.ok ? r(200, x) : fail(x); }
    case "consent": { const x = await setConsent(rt.store, actor, body); return x.ok ? r(200, x) : fail(x); }
    case "utterance": { const x = await ingestUtterance(rt.store, actor, body); return x.ok ? r(200, x) : fail(x); }
    case "memory_ask": {
      const events = await rt.store.all();
      const a = askTeamMemory(rt.snapshot, events, actor, String(body.question ?? ""));
      return r(200, {
        ok: true, kind: a.kind, speak: a.speak, question: a.question, offerEscalation: a.offerEscalation,
        decision: "decision" in a ? { ...a.decision, approvedByName: a.decision.approvedBy ? nameOf(rt.snapshot, a.decision.approvedBy) : undefined } : null,
        sources: a.sources, pendingTicket: "pendingTicket" in a ? a.pendingTicket ?? null : null,
        provisional: a.provisional.map((u) => ({ text: u.text, status: u.status, source: u.source, speakerConfidence: u.speakerConfidence })),
        contextVersion: contextVersion(events), label: rt.snapshot.label,
      });
    }
    case "ticket_create": { const x = await createTicket(rt.store, rt.snapshot, actor, body); return x.ok ? r(200, x) : fail(x); }
    case "ticket_withdraw": { const x = await withdraw(rt.store, actor, String(body.ticket_id ?? "")); return x.ok ? r(200, x) : r(409, { ok: false, error: x.reason }); }
    case "ticket_call_leader": { const x = await requestLeaderCall(rt.store, rt.snapshot, actor, String(body.ticket_id ?? "")); return x.ok ? r(200, x) : r(409, { ok: false, error: x.reason }); }
    case "deliveries": return r(200, { ok: true, ...(await deliveries(rt.store, actor)), contextVersion: contextVersion(await rt.store.all()) });
    case "delivery_seen": { const x = await markDelivered(rt.store, actor, String(body.ticket_id ?? "")); return x.ok ? r(200, x) : r(409, { ok: false, error: x.reason }); }
    case "delivery_ack": { const x = await acknowledge(rt.store, actor, String(body.ticket_id ?? "")); return x.ok ? r(200, x) : r(409, { ok: false, error: x.reason }); }
    case "code_navigate": { const x = navigateCode(rt.snapshot, actor, String(body.question ?? ""), typeof body.task_id === "string" ? body.task_id : undefined); return x.ok ? r(200, x) : fail(x); }
    case "leader_step_up": {
      const x = await stepUp(rt.store, actor, rt.stepUpVerifier ?? hmacCodeVerifier(process.env.KKB_LEADER_STEPUP_SECRET), body.code);
      return x.ok ? r(200, x) : r(403, { ok: false, error: x.reason });
    }
    case "leader_presence": { const x = await setPresence(rt.store, actor, body); return x.ok ? r(200, x) : r(403, { ok: false, error: x.reason }); }
    case "leader_inbox": { const x = await leaderInbox(rt.store, rt.snapshot, actor); return x.ok ? r(200, x) : fail(x); }
    case "passkey_options": {
      if (actor.role !== "leader") return r(403, { ok: false, error: "only the leader uses a passkey here" });
      return r(200, { ok: true, ...(await issueChallenge(rt.store, actor, body.purpose === "register" ? "register" : "assert")) });
    }
    case "passkey_register": { const x = await registerPasskey(rt.store, actor, body); return x.ok ? r(200, x) : r(403, { ok: false, error: x.reason }); }
    case "passkey_assert": { const x = await assertPasskey(rt.store, actor, body); return x.ok ? r(200, x) : r(403, { ok: false, error: x.reason }); }
    case "code_graph_query": {
      const access = zoneAccess(actor, "code_navigator");
      if (!access.allowed) return r(403, { ok: false, error: access.reason });
      const g = getCodeGraph(rt.snapshot);
      const task = typeof body.task_id === "string" ? rt.snapshot.tasks.find(t => t.id === body.task_id && actor.participant.taskIds.includes(t.id) && actor.meetingIds.includes(t.meetingId)) : undefined;
      if (body.task_id && !task) return r(403, { ok: false, error: "task not authorized" });
      const pr = task?.prNumber != null ? rt.snapshot.pullRequests.find(p => p.number === task.prNumber && p.repository === rt.snapshot.repository) : undefined;
      const u = understand(String(body.question ?? ""));
      const a = queryGraph(g, u.normalized, rt.snapshot.files, new Set(pr?.changedFiles ?? []));
      const ruleTask = rt.snapshot.tasks.find((t) => a.seed && t.searchTerms.includes(a.seed.label.toLowerCase()) && actor.meetingIds.includes(t.meetingId));
      const rulePassage = ruleTask ? rt.snapshot.passages.find((p) => ruleTask.passageIds.includes(p.id)) : undefined;
      const fp = explainFirstPrinciples(rt.snapshot, a, rulePassage ? `${rulePassage.text} (${rulePassage.speaker}, ${rulePassage.id})` : undefined);
      if (fp) await rt.store.append(ev("code_focus", actor.participant.id, { ...fp, from: "web" }));
      // Return only this authorized snapshot, with a bounded visual subset.
      // Prefer the answer path so truncation cannot hide its code pointers.
      const selected = new Set(a.subgraph.nodes);
      const nodes = [...g.nodes.filter(n => selected.has(n.id)), ...g.nodes.filter(n => !selected.has(n.id))].slice(0, 600);
      const ids = new Set(nodes.map(n => n.id));
      const graph = { nodes, edges: g.edges.filter(e => ids.has(e.from) && ids.has(e.to)).slice(0, 1800), godNodes: g.godNodes.filter(id => ids.has(id)), sha: g.sha, repository: g.repository };
      return r(200, { ok: true, ...a, graph, sha: g.sha, repository: g.repository, label: rt.snapshot.label, engine: "builtin_static_graph", understood: u, firstPrinciples: fp });
    }
    case "code_focus": {
      // Latest code location to box in this person's browser (set by their call or their own query).
      if (!zoneAccess(actor, "code_navigator").allowed) return r(403, { ok: false, error: "no repository access" });
      const f = zoneEvents(await rt.store.all(), "code_focus").filter((e) => e.key === actor.participant.id);
      const last = f[f.length - 1];
      return r(200, { ok: true, focus: last ? { ...last.data, at: last.at } : null });
    }
    case "understand": return r(200, { ok: true, ...understand(String(body.text ?? "")) });
    case "leader_resolve": { const x = await resolveTicket(rt.store, rt.snapshot, actor, body); return x.ok ? r(200, x) : fail(x); }
  }
}
