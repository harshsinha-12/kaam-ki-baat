import { it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { EventStore } from "../lib/store/event-store";
import { hashToken } from "../lib/auth/call-session";
import { evaluationMarkdown } from "../lib/eval/recorder";
import { testSnapshot } from "./helpers/snapshot";

it("keeps phone setup audit events out of the prepared call evaluation", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "kkb-phone-"));
  const id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const source = (file: string) => pathToFileURL(path.resolve(file)).href;
  try {
    await mkdir(path.join(directory, "data/private"), { recursive: true });
    const snapshot = { ...testSnapshot(), label: "LIVE" }; // Synthetic LIVE label; all HTTP is stubbed below.
    const snapshotFile = path.join(directory, "snapshot.json");
    const eventsFile = path.join(directory, "events.jsonl");
    await writeFile(snapshotFile, JSON.stringify(snapshot));
    await writeFile(path.join(directory, "recipient.txt"), "+12025550123");
    await writeFile(path.join(directory, "consent.json"), JSON.stringify({
      participantId: "dev", consentToCall: true, consentToRecording: true,
      recordedAt: new Date().toISOString(),
    }));
    const preload = path.join(directory, "http-stub.mjs");
    await writeFile(preload, `
      import { EventStore } from ${JSON.stringify(source("lib/store/event-store.ts"))};
      import { runTool } from ${JSON.stringify(source("lib/tools/runtime.ts"))};
      import { readFileSync } from 'node:fs';
      const snapshot = JSON.parse(readFileSync(process.env.KKB_SNAPSHOT, 'utf8'));
      const runtime = { store: new EventStore(process.env.KKB_EVENTS_FILE), snapshot, conversations: new Map() };
      globalThis.fetch = async (url, init) => {
        if (url === 'https://synthetic.invalid/api/health') return Response.json({ snapshot });
        if (url === 'https://synthetic.invalid/api/tools/get_my_brief') {
          const result = await runTool(runtime, 'get_my_brief', JSON.parse(init.body));
          return Response.json(result.body, { status: result.status });
        }
        throw new Error('Unexpected HTTP request; no provider calls permitted in this test');
      };
    `);
    const output = execFileSync(process.execPath, [
      "--import", createRequire(import.meta.url).resolve("tsx"), "--import", pathToFileURL(preload).href,
      path.resolve("scripts/start-phone-call.ts"), "--recipient-file", "recipient.txt", "--consent-file", "consent.json",
    ], {
      cwd: directory, encoding: "utf8", timeout: 15000,
      env: { ...process.env, BOLNA_AGENT_ID: id, BOLNA_API_KEY: "synthetic-provider-key",
        KKB_TOOL_KEY: "synthetic-tool-key", KKB_PUBLIC_URL: "https://synthetic.invalid",
        KKB_SNAPSHOT: snapshotFile, KKB_EVENTS_FILE: eventsFile, KKB_CODE_GRAPH: "" },
    });
    assert.match(output, /No call placed/);
    const prepared = JSON.parse(await readFile(path.join(directory, "data/private/first-phone-call.json"), "utf8"));
    const store = new EventStore(eventsFile);
    const events = await store.all();
    const setup = events.find(e => e.type === "tool_call");
    assert.ok(setup?.type === "tool_call" && setup.ok);
    assert.notEqual(setup.callId, prepared.callId, "setup must use a different call ID from the provider payload");
    assert.equal(prepared.preflightCallId, setup.callId);
    const session = await store.findCallByTokenHash(hashToken(prepared.payload.user_data.call_token));
    assert.equal(session?.callId, prepared.callId);
    assert.equal(session?.participantId, "dev");
    assert.equal(prepared.payload.user_data.current_task_id, "t1");
    const raw = { id, status: "completed", conversation_duration: 48 };
    const report = evaluationMarkdown(raw, events, prepared.callId);
    assert.match(report, /Tool results \(unavailable\)/);
    assert.match(report, /Communicated facts: unavailable/);
    assert.doesNotMatch(report, /get_my_brief \| success/);
    await store.append({ type: "tool_call", at: new Date().toISOString(), callId: prepared.callId,
      tool: "get_task_evidence", ok: true, summary: "synthetic voice result", evidenceIds: [] });
    const withVoice = evaluationMarkdown(raw, await store.all(), prepared.callId);
    assert.match(withVoice, /Tool results \(1\)/);
    assert.match(withVoice, /get_task_evidence \| success/);
    assert.doesNotMatch(withVoice, /get_my_brief \| success/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
