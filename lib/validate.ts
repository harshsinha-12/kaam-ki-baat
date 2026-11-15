import type { CompletionStatus, TaskUpdateRequest } from "./contracts";

const STATUSES: readonly CompletionStatus[] = ["not_started", "in_progress", "blocked", "reported_done"];

export type Parsed<T> = { ok: true; value: T } | { ok: false; reason: string };

export function parseTaskUpdate(raw: unknown): Parsed<TaskUpdateRequest> {
  if (!raw || typeof raw !== "object") return { ok: false, reason: "body must be an object" };
  const r = raw as Record<string, unknown>;
  const taskId = r.taskId ?? r.task_id;
  const status = r.intendedStatus ?? r.status;
  const key = r.idempotencyKey ?? r.idempotency_key;
  const confirmation = r.confirmation ?? r.confirmed;
  if (typeof taskId !== "string" || !taskId) return { ok: false, reason: "taskId required" };
  if (typeof status !== "string" || !STATUSES.includes(status as CompletionStatus))
    return { ok: false, reason: `status must be one of ${STATUSES.join(", ")}` };
  if (confirmation !== true && confirmation !== "true") return { ok: false, reason: "caller has not confirmed" };
  if (typeof key !== "string" || key.length < 8) return { ok: false, reason: "idempotencyKey (8+ chars) required" };
  return { ok: true, value: { taskId, intendedStatus: status as CompletionStatus, confirmation: true, idempotencyKey: key } };
}
