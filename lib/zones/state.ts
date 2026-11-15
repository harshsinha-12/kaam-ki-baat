import type { StoredEvent, ZoneEvent } from "../store/event-store";
import type { ClarificationTicket, Consent, Decision, DeviceSession, LiveUtterance, Zone } from "./contracts";

// Typed views over the append-only log. Every projection is a pure fold, so the
// same events always produce the same state (and tests can replay them).

export type ZoneKind =
  | "device_session"
  | "step_up"
  | "step_up_attempt"
  | "consent"
  | "focus"
  | "activation"
  | "decision"
  | "resolution"
  | "ticket"
  | "utterance"
  | "presence"
  | "bolna_execution"
  | "passkey"
  | "webauthn_challenge"
  | "webauthn_used";

export const zoneEvents = (events: StoredEvent[], kind?: ZoneKind): ZoneEvent[] =>
  events.filter((e): e is ZoneEvent => e.type === "zone" && (!kind || e.kind === kind));

export const ev = (kind: ZoneKind, key: string, data: object, at = new Date().toISOString()): ZoneEvent => ({
  type: "zone",
  at,
  kind,
  key,
  data: data as Record<string, unknown>,
});

export function deviceSessionByHash(events: StoredEvent[], tokenHash: string): DeviceSession | null {
  const hit = zoneEvents(events, "device_session").find((e) => (e.data as unknown as DeviceSession).tokenHash === tokenHash);
  return hit ? (hit.data as unknown as DeviceSession) : null;
}

export function latestStepUp(events: StoredEvent[], sessionId: string): { method: string; expiresAt: string } | null {
  const ups = zoneEvents(events, "step_up").filter((e) => e.key === sessionId);
  return ups.length ? (ups[ups.length - 1].data as { method: string; expiresAt: string }) : null;
}

export function latestConsent(events: StoredEvent[], sessionId: string): Consent | null {
  const cs = zoneEvents(events, "consent").filter((e) => e.key === sessionId);
  return cs.length ? (cs[cs.length - 1].data as unknown as Consent) : null;
}

export function focusState(events: StoredEvent[], sessionId: string): { zone: Zone | null; seq: number; activeZone: Zone | null } {
  const f = zoneEvents(events, "focus").filter((e) => e.key === sessionId);
  const a = zoneEvents(events, "activation").filter((e) => e.key === sessionId);
  const last = f[f.length - 1]?.data as { zone: Zone; seq: number } | undefined;
  return { zone: last?.zone ?? null, seq: last?.seq ?? 0, activeZone: (a[a.length - 1]?.data as { zone: Zone } | undefined)?.zone ?? null };
}

/** Latest version of each decision recorded in the log (leader resolutions). */
export function loggedDecisions(events: StoredEvent[]): Map<string, Decision> {
  const m = new Map<string, Decision>();
  for (const e of zoneEvents(events).filter(e => e.kind === "decision" || e.kind === "resolution")) {
    const d = (e.kind === "resolution" ? e.data.decision : e.data) as Decision;
    const prev = m.get(d.id);
    if (!prev || d.version > prev.version) m.set(d.id, d);
  }
  return m;
}

/** Tickets fold: latest record per ticket id wins (state machine enforced on write). */
export function tickets(events: StoredEvent[]): Map<string, ClarificationTicket> {
  const m = new Map<string, ClarificationTicket>();
  for (const e of zoneEvents(events).filter(e => e.kind === "ticket" || e.kind === "resolution"))
    m.set(e.key, (e.kind === "resolution" ? e.data.ticket : e.data) as ClarificationTicket);
  return m;
}

export function utterances(events: StoredEvent[]): LiveUtterance[] {
  return zoneEvents(events, "utterance").map((e) => e.data as unknown as LiveUtterance);
}

/** Global context version: bumps whenever approved team memory changes. */
export function contextVersion(events: StoredEvent[]): number {
  return 1 + zoneEvents(events).filter(e => e.kind === "decision" || e.kind === "resolution").length;
}

export function leaderPresence(events: StoredEvent[], participantId: string): { available: boolean; callConsent: boolean } {
  const p = zoneEvents(events, "presence").filter((e) => e.key === participantId);
  return (p[p.length - 1]?.data as { available: boolean; callConsent: boolean } | undefined) ?? { available: false, callConsent: false };
}
