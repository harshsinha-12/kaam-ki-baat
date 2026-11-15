import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { EvidenceSnapshot, Participant } from "../contracts";
import type { CallSession, EventStore } from "../store/event-store";

// Identity is established server-side (D-009). The model never chooses who the
// caller is; Bolna only forwards the opaque per-call token we issued.

export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export async function issueCallSession(
  store: EventStore,
  input: Omit<CallSession, "callId" | "tokenHash" | "expiresAt"> & { ttlMinutes?: number },
): Promise<{ token: string; session: CallSession }> {
  const token = randomBytes(24).toString("base64url");
  const session: CallSession = {
    callId: `call_${randomBytes(6).toString("hex")}`,
    tokenHash: hashToken(token),
    participantId: input.participantId,
    meetingIds: input.meetingIds,
    repository: input.repository,
    consentRecordedBy: input.consentRecordedBy,
    scenario: input.scenario,
    expiresAt: new Date(Date.now() + (input.ttlMinutes ?? 60) * 60_000).toISOString(),
  };
  await store.append({ type: "call_session", at: new Date().toISOString(), session });
  return { token, session };
}

export interface Caller {
  session: CallSession;
  participant: Participant;
  taskIds: ReadonlySet<string>;
}

export type AuthResult = { ok: true; caller: Caller } | { ok: false; status: 401 | 403; reason: string };

/** Server key check for every runtime tool request (Authorization: Bearer). */
export function checkServerKey(header: string | null, expected: string | undefined): boolean {
  if (!expected || !header?.startsWith("Bearer ")) return false;
  const a = Buffer.from(header.slice(7));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function resolveCaller(
  store: EventStore,
  snapshot: EvidenceSnapshot,
  token: unknown,
  now = new Date(),
): Promise<AuthResult> {
  if (typeof token !== "string" || token.length < 16) return { ok: false, status: 401, reason: "missing call token" };
  const session = await store.findCallByTokenHash(hashToken(token));
  if (!session) return { ok: false, status: 401, reason: "unknown call token" };
  if (new Date(session.expiresAt) < now) return { ok: false, status: 401, reason: "call token expired" };
  if (!session.consentRecordedBy) return { ok: false, status: 403, reason: "no consent recorded" };
  if (session.repository !== snapshot.repository) return { ok: false, status: 403, reason: "repository not authorized for this call" };
  const participant = snapshot.participants.find((p) => p.id === session.participantId);
  if (!participant) return { ok: false, status: 403, reason: "participant not in authorized snapshot" };
  // A task is visible only if the participant holds it AND its meeting is authorized for both the call and the person.
  const taskIds = new Set(
    snapshot.tasks
      .filter((t) => participant.taskIds.includes(t.id))
      .filter((t) => session.meetingIds.includes(t.meetingId) && participant.meetingIds.includes(t.meetingId))
      .map((t) => t.id),
  );
  return { ok: true, caller: { session, participant, taskIds } };
}
