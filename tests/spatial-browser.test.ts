import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { issueCallSession, resolveCaller } from "../lib/auth/call-session";
import { EventStore } from "../lib/store/event-store";
import { runTool, type Runtime } from "../lib/tools/runtime";
import { buildSpatialContext, emptyPage } from "../lib/spatial/context";
import { SpatialBridge } from "../lib/spatial/bridge";
import { evidenceUrl, parseAction } from "../lib/spatial/contracts";
import { buildSpatialBolnaTools } from "../lib/spatial/bolna-config";
import { executeBrowserAction } from "../lib/spatial/browser-actions";
import { parsePage, readBody } from "../lib/spatial/http";
import { testSnapshot } from "./helpers/snapshot";
import { POST as browserPost } from "../app/api/spatial/browser/route";
import { POST as toolPost } from "../app/api/spatial/tools/[tool]/route";
import { POST as mintPost } from "../app/api/spatial/bolna-session/route";

async function setup() {
  const rt: Runtime = { store: new EventStore(null), snapshot: testSnapshot(), conversations: new Map() };
  const { token, session } = await issueCallSession(rt.store, { participantId: "dev", meetingIds: ["m1"], repository: "team/repo", consentRecordedBy: "synthetic test", scenario: "browser fixture" });
  const auth = await resolveCaller(rt.store, rt.snapshot, token);
  assert.ok(auth.ok);
  return { rt, token, session, caller: auth.caller };
}

describe("participant-scoped spatial context", () => {
  it("shares approved task passages and provenance, not other meetings, tasks or repository contents", async () => {
    const { rt, caller, token } = await setup();
    rt.snapshot.passages.push({ ...rt.snapshot.passages[0], id: "secret", meetingId: "m2", text: "private unrelated passage" });
    await runTool(rt, "get_my_brief", { call_token: token });
    await runTool(rt, "get_task_evidence", { call_token: token, focus: "locate", question: "where is the code?" });
    const c = buildSpatialContext(rt, caller);
    assert.equal(c.task?.id, "t1");
    assert.equal(c.meetings[0].passages[0].charStart, 0);
    assert.equal(c.meetings[0].passages[0].speaker, "Lead");
    assert.ok(c.cards.some(card => card.evidence.length > 0));
    assert.ok(c.findings.every(f => f.commitSha === c.snapshot.pinnedSha));
    assert.equal(c.snapshot.pinnedSha, rt.snapshot.pinnedSha);
    assert.doesNotMatch(JSON.stringify(c), /private unrelated passage|t_private|lead task|tokenHash|file content/);
    rt.snapshot.meetings[0].approvedBy = "";
    assert.equal(buildSpatialContext(rt, caller).task, null);
    assert.deepEqual(buildSpatialContext(rt, caller).meetings, []);
  });
  it("drops a conversation whose task is no longer permitted", async () => {
    const { rt, caller, token, session } = await setup();
    await runTool(rt, "get_my_brief", { call_token: token });
    rt.conversations.get(session.callId)!.focus.taskId = "t_lead";
    rt.conversations.get(session.callId)!.cards.code_scout.summary = "other participant content";
    assert.doesNotMatch(JSON.stringify(buildSpatialContext(rt, caller)), /other participant content/);
  });
});

describe("browser action acknowledgements", () => {
  it("needs a connected browser, scopes evidence IDs, and confirms only after state read-back", async () => {
    const { rt, caller, session } = await setup();
    const bridge = new SpatialBridge(100);
    const expiry = Date.now() + 60000;
    const c = buildSpatialContext(rt, caller);
    assert.equal((await bridge.execute(session.callId, expiry, { type: "focus_space", target: "code" }, c)).ok, false);
    bridge.heartbeat(session.callId, expiry, emptyPage());
    assert.equal((await bridge.execute(session.callId, expiry, { type: "focus_evidence", target: "another-call-evidence" }, c)).ok, false);
    const result = bridge.execute(session.callId, expiry, { type: "focus_space", target: "code" }, c);
    const [pending] = bridge.heartbeat(session.callId, expiry, emptyPage());
    assert.ok(pending);
    assert.deepEqual(bridge.heartbeat("unrelated-call", expiry, emptyPage()), []);
    bridge.heartbeat(session.callId, expiry, { ...emptyPage(), space: "code" }, { id: pending.id, result: { ok: true, message: "Displayed code." } });
    assert.deepEqual(await result, { ok: true, message: "Displayed code." });
    assert.deepEqual(bridge.heartbeat(session.callId, expiry, emptyPage()), []);
  });
  it("refuses mismatched state, unacknowledged actions and delayed replay", async () => {
    const { rt, caller, session } = await setup();
    const bridge = new SpatialBridge(10);
    const expiry = Date.now() + 60000;
    const c = buildSpatialContext(rt, caller);
    bridge.heartbeat(session.callId, expiry, emptyPage());
    const result = bridge.execute(session.callId, expiry, { type: "focus_space", target: "code" }, c);
    const [pending] = bridge.heartbeat(session.callId, expiry, emptyPage());
    bridge.heartbeat(session.callId, expiry, emptyPage(), { id: pending.id, result: { ok: true, message: "pretend" } });
    assert.equal((await result).ok, false);
    const timeout = bridge.execute(session.callId, expiry, { type: "focus_space", target: "code" }, c);
    const [late] = bridge.heartbeat(session.callId, expiry, emptyPage());
    assert.equal((await timeout).ok, false);
    assert.deepEqual(bridge.heartbeat(session.callId, expiry, emptyPage(), { id: late.id, result: { ok: true, message: "late" } }), []);
  });
});

it("rejects arbitrary DOM/code/URL/leader actions and non-repository links", () => {
  for (const value of [{ type: "eval", target: "alert(1)" }, { type: "focus_space", target: "leader" }, { type: "focus_space", target: "agent" }, { type: "scroll_page", target: "down", script: "alert(1)" }]) assert.equal(parseAction(value), null);
  assert.equal(parsePage({ ...emptyPage(), space: "leader" }), null);
  for (const url of ["javascript:alert(1)", "https://evil.com/team/repo/blob/a", "https://github.com/team/repo-other/blob/a", "https://github.com/other/repo/blob/a"]) assert.equal(evidenceUrl(url, "team/repo"), null);
  assert.equal(evidenceUrl("https://github.com/team/repo/blob/123/file.ts#L1", "team/repo"), "https://github.com/team/repo/blob/123/file.ts#L1");
});

it("builds optional Bolna HTTP functions with server auth and opaque caller context", () => {
  const tools = buildSpatialBolnaTools("https://demo.example/", "x".repeat(40));
  assert.deepEqual(tools.map(t => t.name), ["get_page_context", "control_page"]);
  for (const t of tools) {
    assert.equal(t.value.url, `https://demo.example/api/spatial/tools/${t.name}`);
    assert.equal(t.key, "custom_task");
    assert.equal(t.value.param.call_token, "%(call_token)s");
    assert.equal(t.value.api_token, `Bearer ${"x".repeat(40)}`);
  }
  assert.throws(() => buildSpatialBolnaTools("http://demo.example", "x".repeat(40)));
});

it("DOM executor refuses a missing target and reads back a revealed target before success", async () => {
  const { rt, caller } = await setup();
  const context = buildSpatialContext(rt, caller);
  const originals = { window: globalThis.window, document: globalThis.document, frame: globalThis.requestAnimationFrame };
  let page = emptyPage();
  let focused = false;
  let present = false;
  const element = { dataset: { spatialId: "code" }, closest: () => null, isConnected: true, scrollIntoView() {}, focus() { focused = true; } };
  Object.assign(globalThis, {
    window: { matchMedia: () => ({ matches: true }) },
    document: { querySelectorAll: () => present ? [element] : [] },
    requestAnimationFrame: (callback: FrameRequestCallback) => { callback(0); return 0; },
  });
  try {
    const run = () => executeBrowserAction({ type: "focus_space", target: "code" }, context, () => page, next => { page = next; });
    assert.equal((await run()).ok, false);
    assert.equal(focused, false);
    present = true;
    assert.equal((await run()).ok, true);
    assert.equal(page.space, "code");
    assert.equal(focused, true);
  } finally { Object.assign(globalThis, { window: originals.window, document: originals.document, requestAnimationFrame: originals.frame }); }
});

it("bounds even streamed request bodies without content-length", async () => {
  const request = new Request("http://localhost/test", { method: "POST", body: JSON.stringify({ large: "x".repeat(17000) }) });
  assert.equal(await readBody(request), null);
});

it("runs the browser-to-Bolna HTTP bridge with synthetic identity and no provider call", async () => {
  const { rt, token } = await setup();
  const global = globalThis as unknown as { __kkbRuntime?: Runtime };
  const oldRuntime = global.__kkbRuntime;
  const oldEnv = { board: process.env.KKB_BOARD_KEY, tool: process.env.KKB_TOOL_KEY, enabled: process.env.KKB_ENABLE_WEB_CALLS, publicUrl: process.env.KKB_PUBLIC_URL };
  global.__kkbRuntime = rt;
  process.env.KKB_BOARD_KEY = "fixture-board-key"; process.env.KKB_TOOL_KEY = "fixture-tool-key"; process.env.KKB_ENABLE_WEB_CALLS = "false";
  process.env.KKB_PUBLIC_URL = "https://workspace.example";
  const req = (path: string, key: string, body: object, callToken = token, origin?: string) => new Request(`http://localhost${path}`, {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "x-kkb-call-token": callToken, "Content-Type": "application/json", ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body),
  });
  try {
    assert.equal((await browserPost(req("/api/spatial/browser", "wrong", { page: emptyPage() }))).status, 401);
    assert.equal((await browserPost(req("/api/spatial/browser", "fixture-board-key", { page: emptyPage() }, "forged-token-forged"))).status, 401);
    assert.equal((await browserPost(req("/api/spatial/browser", "fixture-board-key", { page: emptyPage() }, token, "https://evil.example"))).status, 403);
    assert.equal((await browserPost(req("/api/spatial/browser", "fixture-board-key", { page: emptyPage() }, token, "https://workspace.example"))).status, 200);
    const initial = await browserPost(req("/api/spatial/browser", "fixture-board-key", { page: emptyPage(), callId: "someone-else" }));
    assert.equal(initial.status, 200);
    const data = await initial.json();
    assert.equal(data.context.callId, (await resolveCaller(rt.store, rt.snapshot, token) as { caller: { session: { callId: string } } }).caller.session.callId);
    assert.equal(data.webCallEnabled, false);
    assert.equal((await mintPost(req("/api/spatial/bolna-session", "fixture-board-key", {}))).status, 503);
    const params = { params: Promise.resolve({ tool: "control_page" }) };
    assert.equal((await toolPost(req("/api/spatial/tools/control_page", "fixture-board-key", { call_token: token, type: "focus_space", target: "code" }), params)).status, 401);
    const pending = toolPost(req("/api/spatial/tools/control_page", "fixture-tool-key", { call_token: token, type: "focus_space", target: "code" }), params);
    // A successful read proves the tool reached the bridge, without timing sleeps.
    let commands: { id: string }[] = [];
    for (let i = 0; i < 20 && !commands.length; i++) {
      const poll = await browserPost(req("/api/spatial/browser", "fixture-board-key", { page: emptyPage() }));
      commands = (await poll.json()).actions;
    }
    assert.equal(commands.length, 1);
    await browserPost(req("/api/spatial/browser", "fixture-board-key", { page: { ...emptyPage(), space: "code" }, receipt: { id: commands[0].id, result: { ok: true, message: "Displayed codebase." } } }));
    assert.equal((await pending).status, 200);
    const context = await toolPost(req("/api/spatial/tools/get_page_context", "fixture-tool-key", { call_token: token }), { params: Promise.resolve({ tool: "get_page_context" }) });
    assert.equal((await context.json()).context.page.space, "code");
    assert.equal((await rt.store.all()).some(e => e.type === "task_update"), false);
    assert.deepEqual((await rt.store.all()).filter(e => e.type === "tool_call").map(e => e.type === "tool_call" && e.tool), ["control_page", "get_page_context"]);
  } finally {
    global.__kkbRuntime = oldRuntime;
    for (const [key, value] of [["KKB_BOARD_KEY", oldEnv.board], ["KKB_TOOL_KEY", oldEnv.tool], ["KKB_ENABLE_WEB_CALLS", oldEnv.enabled], ["KKB_PUBLIC_URL", oldEnv.publicUrl]]) {
      if (value === undefined) delete process.env[key!]; else process.env[key!] = value;
    }
  }
});
