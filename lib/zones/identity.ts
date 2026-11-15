import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { hashToken } from "../auth/call-session";
import type { EvidenceSnapshot, Participant } from "../contracts";
import type { EventStore } from "../store/event-store";
import type { DeviceSession, Role } from "./contracts";
import { deviceSessionByHash, ev, latestStepUp } from "./state";

// Server-owned identity for the spatial zones. A client may present an opaque
// session token; role, repo access and leader step-up are derived here only.

export interface Actor {
  participant: Participant;
  role: Role;
  repoAccess: boolean;
  sessionId: string;
  channel: "device" | "call";
  stepUpFresh: boolean; // leader re-verified recently (privileged actions)
  meetingIds: string[];
}

export type ActorResult = { ok: true; actor: Actor } | { ok: false; status: 401 | 403; reason: string };

const STEP_UP_MINUTES = 10;

export async function issueDeviceSession(
  store: EventStore,
  snapshot: EvidenceSnapshot,
  input: { participantId: string; deviceLabel: string; ttlMinutes?: number },
): Promise<{ token: string; session: DeviceSession }> {
  if (!snapshot.participants.some((p) => p.id === input.participantId)) throw new Error("unknown participant");
  const token = randomBytes(24).toString("base64url");
  const session: DeviceSession = {
    sessionId: `dev_${randomBytes(6).toString("hex")}`,
    tokenHash: hashToken(token),
    participantId: input.participantId,
    deviceLabel: input.deviceLabel.slice(0, 60),
    expiresAt: new Date(Date.now() + (input.ttlMinutes ?? 240) * 60_000).toISOString(),
  };
  await store.append(ev("device_session", session.sessionId, session));
  return { token, session };
}

export async function resolveDeviceActor(store: EventStore, snapshot: EvidenceSnapshot, token: unknown, now = new Date()): Promise<ActorResult> {
  if (typeof token !== "string" || token.length < 16) return { ok: false, status: 401, reason: "missing session token" };
  const events = await store.all();
  const session = deviceSessionByHash(events, hashToken(token));
  if (!session) return { ok: false, status: 401, reason: "unknown session" };
  if (new Date(session.expiresAt) < now) return { ok: false, status: 401, reason: "session expired" };
  const participant = snapshot.participants.find((p) => p.id === session.participantId);
  if (!participant) return { ok: false, status: 403, reason: "participant not authorized" };
  const up = latestStepUp(events, session.sessionId);
  return {
    ok: true,
    actor: {
      participant,
      role: participant.role ?? "member",
      repoAccess: participant.repoAccess ?? true,
      sessionId: session.sessionId,
      channel: "device",
      stepUpFresh: Boolean(up && new Date(up.expiresAt) > now && participant.role === "leader"),
      meetingIds: participant.meetingIds,
    },
  };
}

// ---- Leader step-up -------------------------------------------------------
// Pluggable verifier. The demo verifier is an HMAC one-time code derived from a
// server secret (KKB_LEADER_STEPUP_SECRET), delivered out of band to the leader
// (`npm run leader:code`). It is NOT a passkey; a WebAuthn verifier slots in here.

export interface StepUpVerifier {
  method: string;
  verify(sessionId: string, proof: unknown, now: Date): boolean;
}

export function leaderCode(secret: string, sessionId: string, now = new Date()): string {
  const window = Math.floor(now.getTime() / 300_000); // 5-minute windows
  const mac = createHmac("sha256", secret).update(`${sessionId}:${window}`).digest();
  return String(mac.readUInt32BE(0) % 1_000_000).padStart(6, "0");
}

export function hmacCodeVerifier(secret: string | undefined): StepUpVerifier {
  return {
    method: "server_otp",
    verify(sessionId, proof, now) {
      if (!secret || typeof proof !== "string" || !/^\d{6}$/.test(proof)) return false;
      const prev = new Date(now.getTime() - 300_000);
      return [leaderCode(secret, sessionId, now), leaderCode(secret, sessionId, prev)].some(
        (c) => timingSafeEqual(Buffer.from(c), Buffer.from(proof)),
      );
    },
  };
}

export async function stepUp(store: EventStore, actor: Actor, verifier: StepUpVerifier, proof: unknown, now = new Date()) {
  if (actor.role !== "leader") return { ok: false as const, reason: "only the verified leader can unlock the Leader Desk" };
  if (actor.channel !== "device") return { ok: false as const, reason: "step-up must happen on an authenticated device" };
  if (!verifier.verify(actor.sessionId, proof, now)) return { ok: false as const, reason: "verification failed" };
  const expiresAt = new Date(now.getTime() + STEP_UP_MINUTES * 60_000).toISOString();
  await store.append(ev("step_up", actor.sessionId, { method: verifier.method, expiresAt }));
  return { ok: true as const, expiresAt };
}
