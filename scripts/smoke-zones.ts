// Production HTTP acceptance check with an isolated synthetic snapshot/store.
// Never contacts Bolna or uses the owner's private evidence or live server.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:net";
import { EventStore } from "../lib/store/event-store";
import { issueDeviceSession, leaderCode } from "../lib/zones/identity";
import { tickets } from "../lib/zones/state";
import { zoneSnapshot } from "../tests/helpers/zones";

async function main() {
  const directory = await mkdtemp(path.join(tmpdir(), "kkb-zones-smoke-"));
  const snapshot = zoneSnapshot();
  const snapshotFile = path.join(directory, "snapshot.json");
  const eventsFile = path.join(directory, "events.jsonl");
  await writeFile(snapshotFile, JSON.stringify(snapshot));
  const store = new EventStore(eventsFile);
  const dev = await issueDeviceSession(store, snapshot, { participantId: "dev", deviceLabel: "synthetic smoke" });
  const lead = await issueDeviceSession(store, snapshot, { participantId: "lead", deviceLabel: "synthetic smoke" });
  const secret = randomBytes(32).toString("hex");
  const callbackKey = randomBytes(32).toString("hex");
  const reserve = createServer();
  await new Promise<void>(resolve => reserve.listen(0, "127.0.0.1", resolve));
  const port = (reserve.address() as { port: number }).port;
  await new Promise<void>((resolve, reject) => reserve.close(e => e ? reject(e) : resolve()));
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(port)], {
    env: { ...process.env, KKB_SNAPSHOT: snapshotFile, KKB_EVENTS_FILE: eventsFile, KKB_LEADER_STEPUP_SECRET: secret, KKB_CALLBACK_KEY: callbackKey, KKB_ENABLE_WEB_CALLS: "false" },
    stdio: "ignore",
  });
  const base = `http://127.0.0.1:${port}`;
  try {
    let ready = false;
    for (let i = 0; i < 40; i++) {
      try { if ((await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(500) })).ok) { ready = true; break; } } catch { /* starting */ }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, "isolated production server did not become ready");
    // The public landing page must not break the existing authenticated root
    // bookmark; redirect before rendering any public links with a board key.
    const landing = await fetch(base);
    assert.equal(landing.status, 200);
    const html = await landing.text();
    assert.match(html, /Meeting mein bola/);
    assert.match(html, /data-reduced-motion="true"/);
    assert.doesNotMatch(html, /<animate(?:Motion)?\b/);
    const legacy = await fetch(`${base}/?key=synthetic-board-key&callId=synthetic-call`, { redirect: "manual" });
    assert.equal(legacy.status, 307);
    const destination = new URL(legacy.headers.get("location")!, base);
    assert.equal(destination.pathname, "/board");
    assert.equal(destination.searchParams.get("key"), "synthetic-board-key");
    assert.equal(destination.searchParams.get("callId"), "synthetic-call");
    assert.equal((await fetch(`${base}/board`)).status, 200);
    async function request(action: string, token?: string, body: unknown = {}, method = "POST") {
      const response = await fetch(`${base}/api/zones/${action}`, { method,
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Session ${token}` } : {}) },
        body: method === "GET" ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(5000),
      });
      return { status: response.status, body: await response.json() as Record<string, any> };
    }
    assert.equal((await request("me")).status, 401);
    assert.equal((await request("me", dev.token)).status, 200);
    assert.equal((await request("consent", dev.token, {}, "GET")).status, 405);
    assert.equal((await request("consent", dev.token, null)).status, 400);
    assert.equal((await request("leader_inbox", dev.token)).status, 403);
    assert.equal((await request("leader_inbox", lead.token)).status, 403);
    const created = await request("ticket_create", dev.token, { question: "When is the demo freeze?", confirmed: true, idempotency_key: "http-smoke-ticket" });
    assert.equal(created.status, 200);
    const ticketId = created.body.ticket.id;
    assert.equal((await request("leader_step_up", lead.token, { code: leaderCode(secret, lead.session.sessionId) })).status, 200);
    assert.equal((await request("leader_inbox", lead.token)).body.pending.length, 1);
    const approved = await request("leader_resolve", lead.token, { ticket_id: ticketId, statement: "Freeze Friday", confirmed: true, expected_version: 0 });
    assert.equal(approved.status, 200);
    assert.equal(approved.body.readBack, true);
    assert.equal((await request("deliveries", dev.token)).body.answered[0].id, ticketId);
    assert.equal(tickets(await new EventStore(eventsFile).all()).get(ticketId)?.answer?.statement, "Freeze Friday");
    const resolutionEvents = (await store.all()).filter(e => e.type === "zone" && e.kind === "resolution");
    assert.equal(resolutionEvents.length, 1);
    for (const authorized of [false, true]) {
      const response = await fetch(`${base}/api/bolna/callback`, { method: "POST", headers: { "Content-Type": "application/json", ...(authorized ? { Authorization: `Bearer ${callbackKey}` } : {}) }, body: JSON.stringify({ id: "http_smoke_execution", status: "completed" }) });
      assert.equal(response.status, authorized ? 200 : 401);
    }
    console.log("FIXTURE production HTTP smoke passed: landing/static-motion SSR, legacy board-key redirect, workspace route, session/leader gates, ticket resolution, persisted read-back and callback auth. No provider request or call.");
  } finally {
    if (server.exitCode === null && server.signalCode === null) {
      const exited = new Promise<void>(resolve => server.once("exit", () => resolve()));
      server.kill("SIGTERM");
      await exited;
    }
    await rm(directory, { recursive: true, force: true });
  }
}
main().catch(() => { console.error("Synthetic zones HTTP smoke failed; no provider call was started."); process.exitCode = 1; });
