// Simulates the demo call against the current snapshot through the real tool
// handlers (no Bolna, no Next). In-memory store. Output is NOT call evidence.
//   npm run demo:dry
import { issueCallSession } from "../lib/auth/call-session";
import { loadSnapshot } from "../lib/evidence/load";
import { EventStore } from "../lib/store/event-store";
import { runTool, type Runtime, type ToolName } from "../lib/tools/runtime";

async function main() {
  const snapshot = loadSnapshot();
  const rt: Runtime = { store: new EventStore(null), snapshot, conversations: new Map() };
  const p = snapshot.participants.find((x) => x.taskIds.length)!;
  const { token, session } = await issueCallSession(rt.store, { participantId: p.id, meetingIds: p.meetingIds, repository: snapshot.repository, consentRecordedBy: "dry-run (no call)", scenario: "dry-run" });
  console.log(`[${snapshot.label}] ${snapshot.repository} @ ${snapshot.pinnedSha.slice(0, 7)} — participant ${p.name}\n`);
  const steps: Array<[ToolName, Record<string, unknown>]> = [
    ["get_my_brief", {}],
    ["get_task_evidence", { question: "ruko, code kahan hai? which function?" }],
    ["get_task_evidence", { question: "ok. did CI actually pass?" }],
    ["record_task_update", { status: "in_progress", confirmed: true, idempotency_key: `${session.callId}-1` }],
    ["record_task_update", { status: "in_progress", confirmed: true, idempotency_key: `${session.callId}-1` }],
  ];
  for (const [tool, body] of steps) {
    const r = await runTool(rt, tool, { call_token: token, ...body });
    console.log(`> ${tool} ${body.question ? `"${body.question}"` : ""}\n  [${r.status}] ${r.body.speak}${r.body.specialist ? `  (${r.body.specialist}, task ${r.body.taskId}, v${r.body.contextVersion})` : ""}${r.body.replayed ? "  (idempotent replay)" : ""}\n`);
  }
}
main();
