import type { EventStore } from "../store/event-store";
import { ev, zoneEvents } from "./state";

// Bolna execution callbacks can arrive late, twice, or out of order. We keep an
// append-only record per execution and never let an older status overwrite a
// terminal one. Duration for the >45 s rule must still come from get_execution.

const RANK: Record<string, number> = { queued: 0, initiated: 1, ringing: 2, "in-progress": 3, in_progress: 3, completed: 9, "call-disconnected": 9, failed: 9, busy: 9, "no-answer": 9, canceled: 9, cancelled: 9 };

export type CallbackResult = { ok: boolean; recorded: boolean; reason: string };

export async function recordExecutionCallback(store: EventStore, body: Record<string, unknown>): Promise<CallbackResult> {
  const id = String(body.id ?? body.execution_id ?? "");
  const status = String(body.status ?? "unknown").toLowerCase();
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(id)) return { ok: false, recorded: false, reason: "missing execution id" };
  return store.appendGuarded<CallbackResult>((log) => {
    const seen = zoneEvents(log, "bolna_execution").filter((e) => e.key === id).map((e) => e.data as { status: string });
    if (seen.some((s) => s.status === status)) return { reject: { ok: true , recorded: false, reason: "duplicate callback" } };
    const best = Math.max(-1, ...seen.map((s) => RANK[s.status] ?? 5));
    if (best >= 9) return { reject: { ok: true , recorded: false, reason: "late callback after terminal status ignored" } };
    if ((RANK[status] ?? 5) < best) return { reject: { ok: true , recorded: false, reason: "out-of-order callback ignored" } };
    // Keep only non-sensitive fields; transcripts stay with the provider.
    const data = { status, agentId: typeof body.agent_id === "string" ? body.agent_id : undefined, reportedDuration: typeof body.conversation_duration === "number" ? body.conversation_duration : undefined, durationSource: "webhook (unverified; confirm via get_execution)" };
    return { append: ev("bolna_execution", id, data), result: { ok: true , recorded: true, reason: "recorded" } };
  });
}
