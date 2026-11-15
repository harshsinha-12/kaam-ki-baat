// Issue a per-call token for ONE consenting participant (D-009, D-022).
//   npm run call:token -- --participant p_dev --consent "verbal consent to Harsh, 13:50 IST" --scenario brief-and-update
// Put the printed token in Bolna user_data as call_token. Never commit it.
import path from "node:path";
import { issueCallSession } from "../lib/auth/call-session";
import { loadSnapshot } from "../lib/evidence/load";
import { EventStore } from "../lib/store/event-store";

const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};

async function main() {
  const participantId = arg("participant");
  const consent = arg("consent");
  if (!participantId || !consent) throw new Error("--participant and --consent are required (no consent, no call)");
  const snapshot = loadSnapshot();
  const p = snapshot.participants.find((x) => x.id === participantId);
  if (!p) throw new Error(`participant ${participantId} is not in the ${snapshot.label} snapshot`);
  const store = new EventStore(path.resolve(process.env.KKB_EVENTS_FILE ?? "data/runtime/events.jsonl"));
  const { token, session } = await issueCallSession(store, {
    participantId,
    meetingIds: p.meetingIds,
    repository: snapshot.repository,
    consentRecordedBy: consent,
    scenario: arg("scenario") ?? "brief-and-update",
    ttlMinutes: Number(arg("ttl") ?? 120),
  });
  console.log(JSON.stringify({ callId: session.callId, call_token: token, expiresAt: session.expiresAt, snapshot: snapshot.label }, null, 2));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
