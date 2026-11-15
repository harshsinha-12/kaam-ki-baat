// Explicit, single-attempt phone launcher. Secrets and provider responses stay private.
// Prepare: node --env-file=.env.local --import tsx scripts/start-phone-call.ts --recipient-file <secure-file> --consent-file data/private/first-call-consent.json
// Dial only after reviewing the prepared result: same command with --place-call.
import assert from "node:assert/strict";
import { link, open, readFile, unlink, writeFile } from "node:fs/promises";
import { issueCallSession } from "../lib/auth/call-session";
import { loadSnapshot } from "../lib/evidence/load";
import { EventStore, eventsLogPath } from "../lib/store/event-store";

const arg = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? undefined : process.argv[i + 1]; };
const name = arg("name") ?? "first-phone-call";
assert.match(name, /^[a-zA-Z0-9_-]{1,60}$/, "Use a simple private attempt name");
const manifest = `data/private/${name}.json`;
const attempt = `data/private/${name}-attempt.json`;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

async function privateWrite(file: string, value: unknown, exclusive = false) {
  const handle = await open(file, exclusive ? "wx" : "w", 0o600);
  try { await handle.writeFile(JSON.stringify(value, null, 2)); await handle.sync(); }
  finally { await handle.close(); }
}

async function main() {
  const store = new EventStore(eventsLogPath());
  const agentId = process.env.BOLNA_AGENT_ID;
  assert.ok(agentId && uuid.test(agentId), "Configured agent ID required");
  assert.ok(process.env.BOLNA_API_KEY, "Provider credential required");
  if (!process.argv.includes("--place-call")) {
    const recipientFile = arg("recipient-file"), consentFile = arg("consent-file");
    assert.ok(recipientFile && consentFile, "Secure recipient and explicit consent files required");
    const recipient = (await readFile(recipientFile, "utf8")).trim();
    assert.match(recipient, /^\+[1-9]\d{7,14}$/, "Recipient must use international format");
    const consent = JSON.parse(await readFile(consentFile, "utf8"));
    assert.equal(consent.consentToCall, true); assert.equal(consent.consentToRecording, true);
    const snapshot = loadSnapshot();
    assert.equal(snapshot.label, "LIVE", "This launcher requires the approved LIVE source");
    const participant = snapshot.participants.find(p => p.id === consent.participantId);
    assert.ok(participant, "Consenting participant must exist in approved snapshot");
    const base = process.env.KKB_PUBLIC_URL;
    assert.ok(base?.startsWith("https://"), "Public HTTPS origin required");
    const health = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(15000) });
    assert.equal(health.status, 200);
    const live = (await health.json()).snapshot;
    for (const key of ["label", "repository", "pinnedSha", "fetchedAt"] as const) assert.equal(live[key], snapshot[key], "Running snapshot must match selected source");
    const { token, session } = await issueCallSession(store, {
      participantId: participant.id, meetingIds: participant.meetingIds, repository: snapshot.repository,
      consentRecordedBy: `Explicit user consent to phone call and recording, recorded ${consent.recordedAt}; private consent receipt`,
      scenario: "first-phone-call-v1", ttlMinutes: 120,
    });
    const response = await fetch(`${base}/api/tools/get_my_brief`, {
      method: "POST", headers: { Authorization: `Bearer ${process.env.KKB_TOOL_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ call_token: token }), signal: AbortSignal.timeout(15000),
    });
    assert.equal(response.status, 200);
    const brief = await response.json();
    assert.equal(typeof brief.speak, "string"); assert.ok(brief.speak.length > 0);
    await privateWrite(manifest, {
      preparedAt: new Date().toISOString(), callId: session.callId, expiresAt: session.expiresAt,
      participantId: participant.id, snapshotSha: snapshot.pinnedSha, publicOrigin: base,
      preflightNote: "Opening tool preflight precedes provider call and is not voice-call evidence.",
      payload: { agent_id: agentId, recipient_phone_number: recipient,
        user_data: { call_token: token, opening_brief: brief.speak,
          current_task_id: typeof brief.task?.id === "string" ? brief.task.id : "",
          leader_name: consent.designatedTeamLeader ?? "" } },
    }, true);
    console.log("Phone call prepared privately. LIVE health and authenticated opening tool passed. No call placed.");
    return;
  }
  const prepared = JSON.parse(await readFile(manifest, "utf8"));
  assert.equal(prepared.payload.agent_id, agentId);
  assert.equal(prepared.publicOrigin, process.env.KKB_PUBLIC_URL, "Callback origin changed; prepare a new reviewed attempt");
  assert.ok(Date.parse(prepared.expiresAt) > Date.now(), "Prepared session expired");
  if (process.argv.includes("--retry-rejected")) {
    const previous = JSON.parse(await readFile(attempt, "utf8"));
    assert.equal(previous.callId, prepared.callId);
    assert.equal(previous.state, "provider_rejected", "Never retry an uncertain or accepted submission");
    assert.equal(previous.httpStatus, 400, "Only an explicit pre-call rejection permits this retry");
    assert.ok(!previous.executionId);
    // A fixed exclusive archive permits one deliberate retry. Concurrent invocations
    // cannot both remove the attempt lock, and the original refusal remains intact.
    await link(attempt, `${attempt}.rejected`);
    await unlink(attempt);
  }
  const submittedAt = new Date().toISOString();
  // Exclusive durable lock prevents an accidental second dial, even after timeout/crash.
  await privateWrite(attempt, { callId: prepared.callId, state: "submitting", submittedAt,
    warning: "Do not retry automatically. Check provider history if the outcome is unknown." }, true);
  const response = await fetch("https://api.bolna.ai/call", {
    method: "POST", headers: { Authorization: `Bearer ${process.env.BOLNA_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(prepared.payload), signal: AbortSignal.timeout(30000),
  });
  const raw = await response.text();
  await writeFile(`data/private/${name}-response.json`, raw, { mode: 0o600 });
  if (!response.ok) {
    await privateWrite(attempt, { callId: prepared.callId, state: "provider_rejected", submittedAt, httpStatus: response.status });
    throw new Error("Provider rejected call; inspect private response before any new attempt");
  }
  const result = JSON.parse(raw);
  assert.ok(typeof result.execution_id === "string" && uuid.test(result.execution_id), "No verified execution ID; check provider history before retrying");
  await store.append({ type: "call_execution", at: new Date().toISOString(), callId: prepared.callId,
    executionId: result.execution_id, agentId, channel: "phone" });
  assert.ok((await store.all()).some(e => e.type === "call_execution" && e.callId === prepared.callId && e.executionId === result.execution_id));
  await privateWrite(attempt, { callId: prepared.callId, executionId: result.execution_id, state: "submitted", submittedAt });
  console.log("One phone call submitted; execution correlation persisted and read back. Connection and duration are not yet verified.");
}
main().catch(() => { console.error("Phone setup/call did not complete. Inspect private state; do not blindly retry a submitted attempt."); process.exitCode = 1; });
