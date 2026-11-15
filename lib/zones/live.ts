import { randomBytes } from "node:crypto";
import type { EventStore } from "../store/event-store";
import type { Consent, LiveUtterance } from "./contracts";
import type { Actor } from "./identity";
import { ev, latestConsent, utterances } from "./state";

// Application live-STT lane (NOT Wispr MCP). Each device opts in separately.
// The browser/companion does speech-to-text; we receive text events only and
// never store raw audio. Everything here stays "provisional" until reconciled,
// and it can never overwrite an approved decision.

export async function setConsent(store: EventStore, actor: Actor, body: Record<string, unknown>): Promise<{ ok: true; consent: Consent } | { ok: false; reason: string }> {
  if (actor.channel !== "device") return { ok: false, reason: "consent is given per device session" };
  const consent: Consent = {
    microphone: body.microphone === true,
    shareWithTeam: body.microphone === true && body.share_with_team === true,
    recordedAt: new Date().toISOString(),
    receiptId: `consent_${randomBytes(5).toString("hex")}`,
  };
  await store.append(ev("consent", actor.sessionId, consent));
  return { ok: true, consent };
}

export type IngestResult =
  | { ok: true; status: "accepted" | "duplicate"; eventId: string }
  | { ok: false; status: 400 | 403 | 409; reason: string };

export async function ingestUtterance(store: EventStore, actor: Actor, body: Record<string, unknown>): Promise<IngestResult> {
  const eventId = String(body.event_id ?? "");
  const utteranceId = String(body.utterance_id ?? "");
  const seq = Number(body.seq);
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(eventId) || !/^[A-Za-z0-9_-]{4,64}$/.test(utteranceId)) return { ok: false, status: 400, reason: "event_id and utterance_id required" };
  if (!Number.isInteger(seq) || seq < 1) return { ok: false, status: 400, reason: "seq must be a positive integer" };
  if (!text || text.length > 2000) return { ok: false, status: 400, reason: "text must be 1–2000 characters" };
  if ("audio" in body || "participant_id" in body) return { ok: false, status: 400, reason: "audio and client-supplied identity are not accepted" };

  return store.appendGuarded<IngestResult>((log) => {
    const consent = latestConsent(log, actor.sessionId);
    if (!consent?.microphone) return { reject: { ok: false, status: 403, reason: "microphone consent is off for this device" } };
    const mine = utterances(log).filter((u) => u.sessionId === actor.sessionId);
    if (mine.some((u) => u.eventId === eventId)) return { reject: { ok: true, status: "duplicate", eventId } }; // reconnect replay
    if (mine.some((u) => u.seq === seq)) return { reject: { ok: false, status: 409, reason: `seq ${seq} already used by another event` } };
    if (body.is_final !== true && mine.some((u) => u.utteranceId === utteranceId && u.isFinal))
      return { reject: { ok: false, status: 409, reason: "late provisional revision after final; ignored" } };
    const u: LiveUtterance = {
      eventId, utteranceId, seq, text,
      sessionId: actor.sessionId,
      participantId: actor.participant.id, // from the server session, never the client
      isFinal: body.is_final === true,
      speakerConfidence: clamp(Number(body.speaker_confidence ?? 1)),
      language: typeof body.language === "string" ? body.language.slice(0, 12) : undefined,
      capturedAt: typeof body.captured_at === "string" ? body.captured_at : new Date().toISOString(),
      receivedAt: new Date().toISOString(),
      source: "app_live_stt",
      status: "provisional",
      visibility: consent.shareWithTeam ? "team" : "private",
    };
    return { append: ev("utterance", eventId, u), result: { ok: true, status: "accepted", eventId } };
  });
}

const clamp = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);
