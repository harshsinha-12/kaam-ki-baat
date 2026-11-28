import type { EvidenceSnapshot } from "../contracts";
import type { EventStore } from "../store/event-store";
import { navigateCode } from "./code";
import { acknowledge, createTicket, deliveries, leaderInbox, markDelivered, requestLeaderCall, resolveTicket, setPresence, withdraw } from "./escalation";
import { activateZone, readFocusInput, recordFocus, recordFocusInputStatus, selectFocusInput, zoneAccess } from "./focus";
import { hmacCodeVerifier, resolveDeviceActor, stepUp, type StepUpVerifier } from "./identity";
import { ingestUtterance, setConsent } from "./live";
import { askTeamMemory, nameOf } from "./memory";
import { meetingCatalog } from "./meeting-context";
import { contextVersion, focusState, latestConsent } from "./state";
import { assertPasskey, issueChallenge, registerPasskey } from "./webauthn";
import { getCodeGraph } from "../codegraph/load";
import { answerFromSeed, queryGraph } from "../codegraph/graph";
import { buildSearchIndex, search, type SearchIndex } from "../codegraph/search";
import { explainFirstPrinciples } from "../codegraph/explain";
import { understand } from "../core/understand";
import { ev, zoneEvents } from "./state";
import { publishSource, readSource, sourceExcerpt } from "../codegraph/source";
import { captureFrame, defaultTimeZone, framesFor, recallFrames, validTimeZone } from "../core/recall-frames";
import { planCommand } from "../core/voice-commands";

// Framework-free dispatcher for the browser / native companion API
// (app/api/zones/[action]/route.ts). Deny by default: every action resolves the
// actor from a server-issued device session token first.

const searchIndexes = new WeakMap<EvidenceSnapshot, SearchIndex>();
/** Semantic search picks the seed (61% vs 32% top-1 on the dev set); the v1 matcher is the fallback. */
function locate(snapshot: EvidenceSnapshot, question: string, changed: Set<string>) {
  const g = getCodeGraph(snapshot);
  if (!searchIndexes.has(snapshot)) searchIndexes.set(snapshot, buildSearchIndex(g, snapshot.files));
  const hits = search(searchIndexes.get(snapshot)!, g, question, "semantic", 8).filter(h => h.kind !== "file" && h.kind !== "test");
  const byId = new Map(g.nodes.map(n => [n.id, n]));
  const top = hits[0] && byId.get(hits[0].id);
  const answer = top ? answerFromSeed(g, top, `${hits[0].why[0] ?? "matched"} → ${top.kind} ${top.label}`, changed) : queryGraph(g, question, snapshot.files, changed);
  const alternatives = hits.slice(0, 5).map(h => ({ label: h.label, kind: h.kind, path: h.path, line: h.line, score: h.score, why: h.why.slice(0, 2) }));
  return { g, answer, alternatives };
}

export interface ZoneRuntime {
  store: EventStore;
  snapshot: EvidenceSnapshot;
  stepUpVerifier?: StepUpVerifier;
}

export const ZONE_ACTIONS = [
  "me", "focus", "focus-input", "focus-input-status", "activate", "consent", "utterance", "memory_sources", "memory_ask", "ticket_create", "ticket_withdraw", "ticket_call_leader",
  "deliveries", "delivery_seen", "delivery_ack", "code_navigate", "leader_step_up", "leader_presence", "leader_inbox", "leader_resolve",
  "passkey_options", "passkey_register", "passkey_assert", "code_graph_query", "code_focus", "code_files", "code_open", "understand",
  "command_plan", "recall_capture", "recall_search",
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
    case "memory_sources": return r(200, { ok: true, meetings: meetingCatalog(rt.snapshot, actor) });
    case "memory_ask": {
      const events = await rt.store.all();
      const a = askTeamMemory(rt.snapshot, events, actor, String(body.question ?? ""), typeof body.meeting_id === "string" ? body.meeting_id : undefined);
      return r(200, {
        ok: true, kind: a.kind, speak: a.speak, question: a.question, offerEscalation: a.offerEscalation,
        decision: "decision" in a ? { ...a.decision, approvedByName: a.decision.approvedBy ? nameOf(rt.snapshot, a.decision.approvedBy) : undefined } : null,
        sources: a.sources, meetings: a.meetings, passages: a.passages, pendingTicket: "pendingTicket" in a ? a.pendingTicket ?? null : null,
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
      const task = typeof body.task_id === "string" ? rt.snapshot.tasks.find(t => t.id === body.task_id && actor.participant.taskIds.includes(t.id) && actor.meetingIds.includes(t.meetingId)) : undefined;
      if (body.task_id && !task) return r(403, { ok: false, error: "task not authorized" });
      const pr = task?.prNumber != null ? rt.snapshot.pullRequests.find(p => p.number === task.prNumber && p.repository === rt.snapshot.repository) : undefined;
      const u = understand(String(body.question ?? ""));
      const { g, answer: a, alternatives } = locate(rt.snapshot, u.normalized, new Set(pr?.changedFiles ?? []));
      const ruleTask = rt.snapshot.tasks.find((t) => a.seed && t.searchTerms.includes(a.seed.label.toLowerCase()) && actor.meetingIds.includes(t.meetingId));
      const rulePassage = ruleTask ? rt.snapshot.passages.find((p) => ruleTask.passageIds.includes(p.id)) : undefined;
      const fp = explainFirstPrinciples(rt.snapshot, a, rulePassage ? `${rulePassage.text} (${rulePassage.speaker}, ${rulePassage.id})` : undefined, u.normalized);
      const source = fp ? sourceExcerpt(rt.snapshot, fp.path, fp.highlights) : null;
      const sourceFocus = source ? await publishSource(rt.store, actor.participant.id, source, "web") : null;
      // Return only this authorized snapshot, with a bounded visual subset.
      // Prefer the answer path so truncation cannot hide its code pointers.
      const selected = new Set(a.subgraph.nodes);
      const nodes = [...g.nodes.filter(n => selected.has(n.id)), ...g.nodes.filter(n => !selected.has(n.id))].slice(0, 600);
      const ids = new Set(nodes.map(n => n.id));
      const graph = { nodes, edges: g.edges.filter(e => ids.has(e.from) && ids.has(e.to)).slice(0, 1800), godNodes: g.godNodes.filter(id => ids.has(id)), sha: g.sha, repository: g.repository };
      return r(200, { ok: true, ...a, graph, sha: g.sha, repository: g.repository, label: rt.snapshot.label, engine: "semantic_seed_static_graph", understood: u, firstPrinciples: fp, sourceFocus, alternatives });
    }
    case "code_files": {
      if (!zoneAccess(actor, "code_navigator").allowed) return r(403, { ok: false, error: "no repository access" });
      return r(200, { ok: true, repository: rt.snapshot.repository, sha: rt.snapshot.pinnedSha,
        files: rt.snapshot.files.map(f => ({ path: f.path, lineCount: f.content.split("\n").length })).sort((a, b) => a.path.localeCompare(b.path)) });
    }
    case "code_open": {
      if (!zoneAccess(actor, "code_navigator").allowed) return r(403, { ok: false, error: "no repository access" });
      if (Object.keys(body).some(k => !["path", "line", "endLine"].includes(k))) return r(400, { ok: false, error: "unexpected source fields" });
      const line = body.line ?? 1, end = body.endLine ?? line;
      const source = sourceExcerpt(rt.snapshot, body.path, [{ start: line as number, end: end as number, reason: "Selected source lines" }]);
      if (!source) return r(400, { ok: false, error: "File or line range is not in the approved snapshot." });
      const focus = await publishSource(rt.store, actor.participant.id, source, "browse");
      return r(200, { ok: true, focus });
    }
    case "code_focus": {
      // Latest code location to box in this person's browser (set by their call or their own query).
      if (!zoneAccess(actor, "code_navigator").allowed) return r(403, { ok: false, error: "no repository access" });
      return r(200, { ok: true, focus: readSource(rt.snapshot, await rt.store.all(), actor.participant.id) });
    }
    case "understand": return r(200, { ok: true, ...understand(String(body.text ?? "")) });
    // Hands-free: plan only. The browser executes allowlisted UI actions itself and
    // every write still goes through its own authorized action (ticket_create, ...).
    case "command_plan": return r(200, { ok: true, plan: planCommand(String(body.text ?? "").slice(0, 500)) });
    case "recall_capture": {
      if (body.source && !zoneAccess(actor, "code_navigator").allowed) return r(403, { ok: false, error: "no repository access" });
      if (body.zone === "leader_desk" && !zoneAccess(actor, "leader_desk").allowed) return r(403, { ok: false, error: "leader desk is lead only" });
      const x = await captureFrame(rt.store, rt.snapshot, actor.participant.id, body);
      return x.ok ? r(200, x) : r(x.status, { ok: false, error: x.reason });
    }
    case "recall_search": {
      const frames = framesFor(await rt.store.all(), actor.participant.id, rt.snapshot.repository);
      const res = recallFrames(frames, rt.snapshot, String(body.question ?? "").slice(0, 300), new Date(), 5, validTimeZone(body.timeZone) ?? defaultTimeZone());
      const hits = res.hits.map(h => ({ ...h, sourceAvailable: !!(h.frame.source && rt.snapshot.files.some(f => f.path === h.frame.source!.path)) }));
      return r(200, { ok: true, hits, window: res.window, total: frames.length });
    }
    case "leader_resolve": { const x = await resolveTicket(rt.store, rt.snapshot, actor, body); return x.ok ? r(200, x) : fail(x); }
  }
}
