import type { CompletionStatus } from "../contracts";
import { parseTaskUpdate } from "../validate";

// Caller identity is trusted only when supplied by server authentication, never from LLM arguments.
export interface SavedUpdate {
  id: string;
  taskId: string;
  actorId: string;
  callId: string | null;
  status: CompletionStatus;
  idempotencyKey: string;
  at: string;
}

export interface UpdateRepository {
  /** Returns the existing record when the idempotency key was already used. */
  writeOnce(record: SavedUpdate): Promise<{ id: string; replayed: boolean }>;
  read(id: string): Promise<SavedUpdate | null>;
}

export type PersistResult =
  | { saved: true; recordId: string; replayed: boolean; readBack: SavedUpdate }
  | { saved: false; reason: string };

export async function persistVerifiedUpdate(args: {
  raw: unknown;
  trustedActorId: string | null;
  callId?: string | null;
  authorizedTaskIds: ReadonlySet<string>;
  blockedTaskIds?: ReadonlyMap<string, string>; // taskId -> reason (e.g. disputed ownership)
  repository: UpdateRepository;
  generateId: () => string;
  now?: () => string;
  timeoutMs?: number;
}): Promise<PersistResult> {
  const parsed = parseTaskUpdate(args.raw);
  if (!parsed.ok) return { saved: false, reason: `invalid or unconfirmed update: ${parsed.reason}` };
  const req = parsed.value;
  if (!args.trustedActorId || !args.authorizedTaskIds.has(req.taskId)) return { saved: false, reason: "unauthorized" };
  const blocked = args.blockedTaskIds?.get(req.taskId);
  if (blocked) return { saved: false, reason: blocked };

  const candidate: SavedUpdate = {
    id: args.generateId(),
    taskId: req.taskId,
    actorId: args.trustedActorId,
    callId: args.callId ?? null,
    status: req.intendedStatus,
    idempotencyKey: req.idempotencyKey,
    at: (args.now ?? (() => new Date().toISOString()))(),
  };
  try {
    const written = await withTimeout(args.repository.writeOnce(candidate), args.timeoutMs ?? 3000);
    const actual = await withTimeout(args.repository.read(written.id), args.timeoutMs ?? 3000);
    if (!actual) return { saved: false, reason: "read-back failed: record not found" };
    const same =
      actual.taskId === candidate.taskId &&
      actual.actorId === candidate.actorId &&
      actual.status === candidate.status &&
      actual.idempotencyKey === candidate.idempotencyKey;
    if (!same) {
      return {
        saved: false,
        reason: written.replayed ? "idempotency key was already used for a different update" : "read-back failed: mismatch",
      };
    }
    return { saved: true, recordId: actual.id, replayed: written.replayed, readBack: actual };
  } catch {
    return { saved: false, reason: "write failed or timed out" };
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}
