// Issue a device session for the spatial web app / AirPods companion.
//   npm run session:issue -- --participant p_lead --device "Lead laptop"
//   npm run leader:code -- --session dev_xxx      (demo step-up code; NOT a passkey)
import path from "node:path";
import { loadSnapshot } from "../lib/evidence/load";
import { EventStore } from "../lib/store/event-store";
import { issueDeviceSession, leaderCode } from "../lib/zones/identity";

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };

async function main() {
  if (arg("session")) {
    const secret = process.env.KKB_LEADER_STEPUP_SECRET;
    if (!secret) throw new Error("KKB_LEADER_STEPUP_SECRET is not set");
    console.log(leaderCode(secret, arg("session")!));
    return;
  }
  const participantId = arg("participant");
  if (!participantId) throw new Error("--participant required");
  const store = new EventStore(path.resolve(process.env.KKB_EVENTS_FILE ?? "data/runtime/events.jsonl"));
  const { token, session } = await issueDeviceSession(store, loadSnapshot(), { participantId, deviceLabel: arg("device") ?? "browser" });
  console.log(JSON.stringify({ sessionId: session.sessionId, session_token: token, expiresAt: session.expiresAt }, null, 2));
}
main().catch((e) => { console.error(e.message); process.exit(1); });
