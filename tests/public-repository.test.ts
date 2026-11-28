import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import os from "node:os";
import path from "node:path";
import { importPublicRepository, IMPORT_LIMITS } from "../lib/project/import";
import { openRepositoryWorkspace, repositoryRuntimeForCall, repositoryRuntimeForDevice } from "../lib/project/workspace";
import { EventStore } from "../lib/store/event-store";
import { issueCallSession, resolveCaller } from "../lib/auth/call-session";
import { issueDeviceSession, resolveDeviceActor } from "../lib/zones/identity";
import { ev, zoneEvents } from "../lib/zones/state";
import { runZoneAction } from "../lib/zones/service";
import { runTool, type Runtime } from "../lib/tools/runtime";
import { testSnapshot } from "./helpers/snapshot";
import { getCodeGraph } from "../lib/codegraph/load";
import { spawnSync } from "node:child_process";

const commit = "a".repeat(40), treeSha = "b".repeat(40);
function githubFixture(options: { private?: boolean; truncated?: boolean; corrupt?: boolean; many?: boolean; oversized?: boolean } = {}) {
  const files = new Map([["README.md", "# Public project\nThis repository runs a project guide."], ["src/main.ts", "export function startGuide() { return 'public'; }"], ["package.json", '{"name":"public-repo"}']]);
  if (options.many) for (let i = 0; i < 90; i++) files.set(`src/module-${i}.ts`, `export const value${i} = ${i};`);
  const hash = (content: string) => createHash("sha1").update(`blob ${Buffer.byteLength(content)}\0`).update(content).digest("hex");
  const tree = [...files].map(([name, content]) => ({ path: name, sha: hash(content), size: Buffer.byteLength(content), type: "blob", mode: "100644" }));
  tree.push({ path: "../outside.ts", sha: hash("outside"), size: 7, type: "blob", mode: "100644" });
  tree.push({ path: "linked.ts", sha: hash("link"), size: 4, type: "blob", mode: "120000" });
  let requests = 0;
  const transport: typeof fetch = async (input, init) => {
    requests++;
    const url = new URL(String(input));
    assert.ok(["api.github.com", "raw.githubusercontent.com"].includes(url.hostname));
    assert.equal(init?.method, undefined, "public imports only read GitHub");
    assert.equal((init?.headers as Record<string, string>).Authorization, undefined, "account tokens never reach a public import");
    assert.equal(init?.redirect, "error");
    if (url.hostname === "raw.githubusercontent.com") {
      assert.ok(url.pathname.startsWith(`/public/repo/${commit}/`));
      const name = decodeURIComponent(url.pathname.slice(`/public/repo/${commit}/`.length));
      assert.ok(files.has(name), "only supported, safe blob paths are fetched");
      return options.oversized ? new Response("x", { headers: { "Content-Length": String(IMPORT_LIMITS.fileBytes + 1) } }) : new Response(options.corrupt ? "modified content" : files.get(name));
    }
    if (url.pathname === "/repos/public/repo") return Response.json({ private: options.private ?? false, full_name: "public/repo", default_branch: "main" });
    if (url.pathname === "/repos/public/repo/git/ref/heads/main") return Response.json({ object: { type: "commit", sha: commit } });
    if (url.pathname === `/repos/public/repo/git/trees/${commit}`) {
      assert.equal(url.search, "");
      return Response.json({ truncated: options.truncated ?? false, tree: [...tree.filter(entry => !entry.path.startsWith("src/")), { path: "src", type: "tree", sha: treeSha, mode: "040000" }] });
    }
    assert.equal(url.pathname, `/repos/public/repo/git/trees/${treeSha}`);
    assert.equal(url.searchParams.get("recursive"), "1");
    return Response.json({ truncated: false, tree: tree.filter(entry => entry.path.startsWith("src/")).map(entry => ({ ...entry, path: entry.path.slice(4) })) });
  };
  return { transport, files, count: () => requests };
}

async function isolatedStorage(run: () => Promise<void>) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "kkb-public-repositories-"));
  const keys = ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN", "VERCEL", "KKB_PUBLIC_REPOSITORIES_DIR"];
  const saved = keys.map(key => process.env[key]);
  try { keys.forEach(key => delete process.env[key]); process.env.KKB_PUBLIC_REPOSITORIES_DIR = directory; await run(); }
  finally { keys.forEach((key, i) => saved[i] === undefined ? delete process.env[key] : process.env[key] = saved[i]); await rm(directory, { recursive: true, force: true }); }
}

test("public import pins verified bytes, excludes unsafe paths and creates no meeting or leader scope", async () => {
  const fixture = githubFixture(), snapshot = await importPublicRepository("https://github.com/public/repo.git", fixture.transport);
  assert.equal(snapshot.repository, "public/repo"); assert.equal(snapshot.pinnedSha, commit); assert.equal(snapshot.label, "LIVE");
  assert.deepEqual(snapshot.files.map(file => file.path).sort(), [...fixture.files.keys()].sort());
  assert.deepEqual(snapshot.meetings, []); assert.deepEqual(snapshot.tasks, []); assert.deepEqual(snapshot.passages, []);
  assert.equal(snapshot.participants[0].role, "member"); assert.deepEqual(snapshot.participants[0].meetingIds, []);
  assert.match(snapshot.note!, /3 selected files/);
});

test("public imports reject private repositories, unsafe URLs, incomplete listings and mismatched blobs", async () => {
  for (const url of ["http://github.com/public/repo", "https://github.com:444/public/repo", "https://github.com.evil/public/repo", "https://user:secret@github.com/public/repo", "https://github.com/public/repo/tree/main", "https://github.com/public/repo?token=secret"]) {
    const fixture = githubFixture();
    await assert.rejects(importPublicRepository(url, fixture.transport), /public GitHub repository URL/);
    assert.equal(fixture.count(), 0);
  }
  await assert.rejects(importPublicRepository("https://github.com/public/repo", githubFixture({ private: true }).transport), /verified public/);
  await assert.rejects(importPublicRepository("https://github.com/public/repo", githubFixture({ truncated: true }).transport), /too large/);
  await assert.rejects(importPublicRepository("https://github.com/public/repo", githubFixture({ corrupt: true }).transport), /verification failed/);
  await assert.rejects(importPublicRepository("https://github.com/public/repo", githubFixture({ oversized: true }).transport), /size limit/);
  await assert.rejects(importPublicRepository("https://github.com/public/repo", async () => new Response("provider secret", { status: 429 })), /request limit/);
});

test("large repositories expose their bounded selection instead of claiming complete indexing", async () => {
  const fixture = githubFixture({ many: true }), snapshot = await importPublicRepository("https://github.com/public/repo", fixture.transport);
  assert.equal(snapshot.files.length, IMPORT_LIMITS.files);
  assert.match(snapshot.note!, /64 selected files from 93 eligible/);
  assert.ok(snapshot.files.some(file => file.path === "README.md"));
});

test("repositories without TypeScript still expose file nodes without inventing symbol relationships", async () => {
  const snapshot = await importPublicRepository("https://github.com/public/repo", githubFixture().transport);
  snapshot.files = [{ path: "main.py", content: "def main():\n    return 'public'\n" }];
  const graph = getCodeGraph(snapshot);
  assert.deepEqual(graph.nodes.map(node => [node.kind, node.path]), [["file", "main.py"]]);
  assert.deepEqual(graph.edges, []);
});

test("concurrent workspace opens read only complete local snapshots", async () => isolatedStorage(async () => {
  const base: Runtime = { snapshot: testSnapshot(), store: new EventStore(null), conversations: new Map() };
  const snapshot = await importPublicRepository("https://github.com/public/repo", githubFixture().transport);
  snapshot.files = Array.from({ length: 20 }, (_, index) => ({
    path: `src/module-${index}.ts`, content: "x".repeat(IMPORT_LIMITS.fileBytes),
  }));
  const attempts = await Promise.allSettled(
    Array.from({ length: 12 }, () => openRepositoryWorkspace(base, snapshot, "same-snapshot")),
  );
  for (const attempt of attempts) {
    if (attempt.status === "rejected") throw attempt.reason;
    assert.deepEqual(attempt.value.rt.snapshot.files, snapshot.files);
  }
  const id = createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
  assert.deepEqual(await readdir(process.env.KKB_PUBLIC_REPOSITORIES_DIR!), [`${id}.json`]);
}));

test("a staged local snapshot remains invisible until atomic publication", { timeout: 5000 }, async (t) => isolatedStorage(async () => {
  const base: Runtime = { snapshot: testSnapshot(), store: new EventStore(null), conversations: new Map() };
  const snapshot = await importPublicRepository("https://github.com/public/repo", githubFixture().transport);
  const link = fs.promises.link;
  let staged = false;
  const publish = t.mock.method(fs.promises, "link", async (pending: string, destination: string) => {
    if (!staged) {
      staged = true;
      assert.equal(await readFile(pending, "utf8"), JSON.stringify(snapshot));
      await assert.rejects(readFile(destination, "utf8"), { code: "ENOENT" });
      // A competing writer wins while the first snapshot is still staged.
      const competing = await openRepositoryWorkspace(base, snapshot, "competing-snapshot");
      assert.deepEqual(competing.rt.snapshot.files, snapshot.files);
    }
    await link(pending, destination);
  });
  syncBuiltinESMExports();
  try {
    const opened = await openRepositoryWorkspace(base, snapshot, "first-snapshot");
    assert.deepEqual(opened.rt.snapshot.files, snapshot.files);
    assert.equal(publish.mock.callCount(), 2);
    assert.equal((await readdir(process.env.KKB_PUBLIC_REPOSITORIES_DIR!)).length, 1);
  } finally {
    publish.mock.restore();
    syncBuiltinESMExports();
  }
}));

test("local publication preserves an existing snapshot that fails read-back", async () => isolatedStorage(async () => {
  const base: Runtime = { snapshot: testSnapshot(), store: new EventStore(null), conversations: new Map() };
  const snapshot = await importPublicRepository("https://github.com/public/repo", githubFixture().transport);
  const id = createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
  const dir = process.env.KKB_PUBLIC_REPOSITORIES_DIR!;
  const destination = path.join(dir, `${id}.json`);
  await writeFile(destination, "incomplete", { mode: 0o600 });
  await assert.rejects(openRepositoryWorkspace(base, snapshot, "invalid-read-back"), /read-back failed/);
  assert.equal(await readFile(destination, "utf8"), "incomplete");
  assert.deepEqual(await readdir(dir), [`${id}.json`]);
  assert.deepEqual(await base.store.all(), []);
}));

test("a fresh process reconstructs the persisted public workspace without a warm snapshot cache", async () => isolatedStorage(async () => {
  const base: Runtime = { snapshot: testSnapshot(), store: new EventStore(null), conversations: new Map() };
  const snapshot = await importPublicRepository("https://github.com/public/repo", githubFixture().transport);
  const opened = await openRepositoryWorkspace(base, snapshot, "cold-test");
  const script = `
    import {readFileSync} from 'node:fs';
    import {repositoryRuntimeForDevice} from './lib/project/workspace.ts';
    import {EventStore} from './lib/store/event-store.ts';
    import {resolveDeviceActor} from './lib/zones/identity.ts';
    const input=JSON.parse(readFileSync(0,'utf8')),store=new EventStore(null);
    for(const event of input.events)await store.append(event);
    const rt=await repositoryRuntimeForDevice({snapshot:input.snapshot,store,conversations:new Map()},input.token);
    const auth=await resolveDeviceActor(store,rt.snapshot,input.token);
    console.log(JSON.stringify({repository:rt.snapshot.repository,sha:rt.snapshot.pinnedSha,authorized:auth.ok,meetings:rt.snapshot.meetings.length}));
  `;
  const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], { encoding: "utf8", input: JSON.stringify({ snapshot: base.snapshot, events: await base.store.all(), token: opened.token }) });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { repository: "public/repo", sha: commit, authorized: true, meetings: 0 });
}));

test("public workspace persists a separate identity, source scope and reconnect without changing the original", async () => isolatedStorage(async () => {
  const snapshot = testSnapshot(), store = new EventStore(null), base: Runtime = { snapshot, store, conversations: new Map() };
  const original = await issueDeviceSession(store, snapshot, { participantId: "dev", deviceLabel: "original" });
  const imported = await importPublicRepository("https://github.com/public/repo", githubFixture().transport);
  const opened = await openRepositoryWorkspace(base, imported, original.session.sessionId);
  assert.equal(base.snapshot, snapshot);
  assert.equal((await repositoryRuntimeForDevice(base, original.token)).snapshot, snapshot);
  assert.equal((await repositoryRuntimeForDevice(base, opened.token)).snapshot.repository, "public/repo");
  assert.equal((await resolveDeviceActor(store, snapshot, opened.token)).ok, false);
  const me = await runZoneAction(opened.rt, "me", opened.token, {});
  assert.equal(me.status, 200); assert.equal(me.body.role, "member");
  assert.equal((await runZoneAction(opened.rt, "leader_inbox", opened.token, {})).status, 403);
  assert.deepEqual((await runZoneAction(opened.rt, "memory_sources", opened.token, {})).body.meetings, []);
  const files = await runZoneAction(opened.rt, "code_files", opened.token, {});
  assert.match(JSON.stringify(files.body), /src\/main.ts/);
  assert.doesNotMatch(JSON.stringify(files.body), /persist-update/);
  const fresh = await repositoryRuntimeForDevice({ ...base, conversations: new Map() }, opened.token);
  assert.equal(fresh.snapshot.pinnedSha, commit);
  const tokenEvent = zoneEvents(await store.all(), "device_session").find(event => event.data.tokenHash === createHash("sha256").update(opened.token).digest("hex"))!;
  assert.ok(tokenEvent);
  assert.doesNotMatch(JSON.stringify(await store.all()), new RegExp(opened.token), "raw session tokens never enter the audit");
}));

test("voice callbacks remain bound to the imported snapshot and cannot read original task evidence", async () => isolatedStorage(async () => {
  const base: Runtime = { snapshot: testSnapshot(), store: new EventStore(null), conversations: new Map() };
  const imported = await importPublicRepository("https://github.com/public/repo", githubFixture().transport);
  const opened = await openRepositoryWorkspace(base, imported, "synthetic-origin");
  const actor = await resolveDeviceActor(base.store, imported, opened.token); assert.ok(actor.ok);
  const call = await issueCallSession(base.store, { participantId: imported.participants[0].id, meetingIds: [], repository: imported.repository, consentRecordedBy: "synthetic only", scenario: "import-test" });
  await base.store.append(ev("project_voice_binding", call.session.callId, { deviceSessionId: actor.actor.sessionId, participantId: imported.participants[0].id }));
  const rt = await repositoryRuntimeForCall(base, call.token);
  assert.equal(rt.snapshot, imported);
  assert.equal((await resolveCaller(base.store, base.snapshot, call.token)).ok, false);
  const response = await runTool(rt, "get_project_context", { call_token: call.token, question: "startGuide" });
  assert.equal(response.status, 200); assert.equal(response.body.repository, "public/repo");
  assert.doesNotMatch(JSON.stringify(response.body), /Private|persist-update/);
  assert.equal((await runTool(rt, "get_task_evidence", { call_token: call.token, task_id: "t1" })).status, 403);
}));

test("HTTP import rotates the browser scope, preserves it on reconnect and keeps voice opt-in", async () => isolatedStorage(async () => {
  const globals = globalThis as unknown as { __kkbRuntime?: Runtime };
  const oldRuntime = globals.__kkbRuntime, transport = globalThis.fetch;
  const base: Runtime = { snapshot: testSnapshot(), store: new EventStore(null), conversations: new Map() };
  globals.__kkbRuntime = base; globalThis.fetch = githubFixture().transport;
  const original = await issueDeviceSession(base.store, base.snapshot, { participantId: "dev", deviceLabel: "browser" });
  const { POST } = await import("../app/api/project/route");
  const { POST: reconnect } = await import("../app/api/workspace-session/route");
  const { POST: zone } = await import("../app/api/zones/[action]/route");
  const request = (token: string, body: object) => new Request("http://localhost/api/project", { method: "POST", headers: { Authorization: `Session ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  try {
    const response = await POST(request(original.token, { repositoryUrl: "https://github.com/public/repo" }));
    assert.equal(response.status, 200);
    const data = await response.json(); assert.equal(data.repository, "public/repo"); assert.ok(data.graph.nodes.length);
    assert.notEqual(data.sessionToken, original.token);
    assert.equal((await (await reconnect(request(data.sessionToken, {}))).json()).token, data.sessionToken);
    const me = await zone(request(data.sessionToken, {}), { params: Promise.resolve({ action: "me" }) });
    assert.equal((await me.json()).snapshot.repository, "public/repo");
    assert.equal((await POST(request(data.sessionToken, { repositoryUrl: "https://github.com/public/repo", action: "voice" }))).status, 400);
    assert.equal((await POST(request("invalid-token-value", { repositoryUrl: "https://github.com/public/repo" }))).status, 401);
    assert.ok((await base.store.all()).every(event => event.type === "zone"), "imports create no call or recording consent");
    const actor = await resolveDeviceActor(base.store, (await repositoryRuntimeForDevice(base, data.sessionToken)).snapshot, data.sessionToken); assert.ok(actor.ok);
    const session = zoneEvents(await base.store.all(), "device_session").find(event => event.key === actor.actor.sessionId)!;
    session.data.expiresAt = "2020-01-01T00:00:00Z";
    // In-memory test store intentionally mutates the authoritative expiry.
    const renewed = await (await reconnect(request(data.sessionToken, {}))).json();
    assert.notEqual(renewed.token, data.sessionToken);
    assert.equal((await repositoryRuntimeForDevice(base, renewed.token)).snapshot.repository, "public/repo");
  } finally { globals.__kkbRuntime = oldRuntime; globalThis.fetch = transport; }
}));

test("a failed file download cancels other in-flight reads in its batch", async () => {
  const fixture = githubFixture();
  let waiting = 0;
  let cancelled = 0;
  const transport: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname !== "raw.githubusercontent.com") return fixture.transport(input, init);
    if (url.pathname.endsWith("/README.md")) return new Response("unavailable", { status: 503 });
    const signal = init?.signal;
    assert.ok(signal);
    waiting++;
    return new Promise<Response>((_, reject) => {
      signal.addEventListener("abort", () => { cancelled++; reject(signal.reason); }, { once: true });
    });
  };
  await assert.rejects(importPublicRepository("https://github.com/public/repo", transport), /could not return/);
  assert.equal(waiting, 2);
  assert.equal(cancelled, waiting);
});
