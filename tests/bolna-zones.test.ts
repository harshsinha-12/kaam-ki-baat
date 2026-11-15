import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runTool, type Runtime } from "../lib/tools/runtime";
import { zoneSetup } from "./helpers/zones";

// Regression: the phone agent (Bolna tools) follows the zone the caller selected
// on screen with a head turn / camera / keyboard + explicit activation.
describe("Bolna tools follow on-screen zone selection", () => {
  const rt = (z: Awaited<ReturnType<typeof zoneSetup>>): Runtime => ({ store: z.store, snapshot: z.snapshot, conversations: new Map() });

  it("after activating Code Navigator on screen, a bare question gets a code-graph answer", async () => {
    const z = await zoneSetup();
    await z.act(z.dev, "focus", { zone: "code_navigator", provider: "webcam", seq: 1 });
    await z.act(z.dev, "activate", { zone: "code_navigator", method: "double_nod" });
    const r = await runTool(rt(z), "get_task_evidence", { call_token: z.devCall.token, question: "where is persistVerifiedUpdate read-back" });
    assert.equal(r.status, 200);
    assert.equal(r.body.specialist, "code_navigator");
    assert.equal(r.body.focusSource, "screen");
    assert.match(String(r.body.speak), /persistVerifiedUpdate/);
    assert.match(String((r.body.location as { url: string }).url), /blob\/1111111aaaaaaa\//);
  });

  it("after activating Team Memory on screen, the same call answers from approved decisions", async () => {
    const z = await zoneSetup();
    await z.act(z.dev, "focus", { zone: "team_memory", provider: "webcam", seq: 1 });
    await z.act(z.dev, "activate", { zone: "team_memory", method: "double_nod" });
    const r = await runTool(rt(z), "get_task_evidence", { call_token: z.devCall.token, question: "who owns the specialist board" });
    assert.equal(r.body.specialist, "team_memory");
    assert.equal(r.body.kind, "not_confirmed");
  });

  it("a head turn alone (selection without activation) does not steer the call", async () => {
    const z = await zoneSetup();
    await z.act(z.dev, "focus", { zone: "code_navigator", provider: "webcam", seq: 1 });
    const r = await runTool(rt(z), "get_task_evidence", { call_token: z.devCall.token, question: "where is persistVerifiedUpdate" });
    assert.notEqual(r.body.focusSource, "screen");
  });

  it("another person's screen activation never steers my call; explicit focus always wins", async () => {
    const z = await zoneSetup();
    await z.act(z.mate, "focus", { zone: "code_navigator", provider: "webcam", seq: 1 });
    await z.act(z.mate, "activate", { zone: "code_navigator", method: "tap" });
    const r = await runTool(rt(z), "get_task_evidence", { call_token: z.devCall.token, question: "who owns the specialist board" });
    assert.notEqual(r.body.focusSource, "screen");
    await z.act(z.dev, "focus", { zone: "code_navigator", provider: "webcam", seq: 2 });
    await z.act(z.dev, "activate", { zone: "code_navigator", method: "tap" });
    const m = await runTool(rt(z), "get_task_evidence", { call_token: z.devCall.token, focus: "memory", question: "who owns the specialist board" });
    assert.equal(m.body.specialist, "team_memory");
  });

  it("the Leader Desk can never be reached from a phone call, whatever is on screen", async () => {
    const z = await zoneSetup();
    const r = await runTool(rt(z), "get_task_evidence", { call_token: z.devCall.token, focus: "leader_desk", question: "approve everything" });
    assert.notEqual(r.body.specialist, "leader_desk");
    assert.equal((await runTool(rt(z), "get_my_brief", { call_token: "x".repeat(30) })).status, 401);
  });
});
