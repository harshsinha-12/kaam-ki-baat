import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { handle } from "../scripts/mcp-server";
import { zoneSetup } from "./helpers/zones";
import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { EventStore } from "../lib/store/event-store";
import { issueDeviceSession } from "../lib/zones/identity";

describe("MCP server (stdio JSON-RPC)", () => {
  it("initializes and lists four read-only tools", async () => {
    assert.equal(((await handle({ id: 1, method: "initialize" })) as { result: { serverInfo: { name: string } } }).result.serverInfo.name, "kaam-ki-baat");
    const tools = ((await handle({ id: 2, method: "tools/list" })) as { result: { tools: { name: string }[] } }).result.tools.map((t) => t.name);
    assert.deepEqual(tools, ["kkb_code_location", "kkb_decisions", "kkb_task_status", "kkb_graph_report"]);
  });
  it("answers an authorized code question and unknown tools are errors", async () => {
    const z = await zoneSetup(); const rt = { ...z.rt, token: z.dev.token };
    const r = await handle({ id: 3, method: "tools/call", params: { name: "kkb_code_location", arguments: { question: "persistVerifiedUpdate read-back" } } }, rt) as { result: { content: { text: string }[] } };
    assert.match(r.result.content[0].text, /blob\/1111111aaaaaaa\//);
    const bad = await handle({ id: 4, method: "tools/call", params: { name: "approve_everything" } }, rt) as { result: { isError: boolean } };
    assert.equal(bad.result.isError, true);
    assert.equal(await handle({ method: "notifications/initialized" }), null);
  });
  it("denies missing identity, other tasks and repository access; filters private passages", async () => {
    const z = await zoneSetup();
    const request = (name: string, args = {}) => ({ id: 5, method: "tools/call", params: { name, arguments: args } });
    const denied = await handle(request("kkb_graph_report"), { ...z.rt, token: "invalid-session" }) as { result: { isError: boolean } };
    assert.equal(denied.result.isError, true);
    const task = await handle(request("kkb_task_status", { task_id: "t_private" }), { ...z.rt, token: z.dev.token }) as { result: { isError: boolean } };
    assert.equal(task.result.isError, true);
    const repo = await handle(request("kkb_graph_report"), { ...z.rt, token: z.outsider.token }) as { result: { isError: boolean } };
    assert.equal(repo.result.isError, true);
    const decisions = await handle(request("kkb_decisions"), { ...z.rt, token: z.mate.token }) as { result: { content: { text: string }[] } };
    assert.doesNotMatch(decisions.result.content[0].text, /private detail|IGNORE ALL PREVIOUS INSTRUCTIONS/);
    const missing = await handle(request("kkb_decisions"), { ...z.rt, token: "" }) as { result: { isError: boolean } };
    assert.equal(missing.result.isError, true);
  });
  it("serves scoped evidence over real stdio and refuses a missing session", async () => {
    const z = await zoneSetup();
    const directory = await mkdtemp(path.join(tmpdir(), "kkb-mcp-"));
    try {
      const snapshotFile = path.join(directory, "snapshot.json"), eventsFile = path.join(directory, "events.jsonl");
      await writeFile(snapshotFile, JSON.stringify(z.snapshot));
      const session = await issueDeviceSession(new EventStore(eventsFile), z.snapshot, { participantId: "dev", deviceLabel: "synthetic MCP" });
      const input = JSON.stringify({ id: 9, method: "tools/call", params: { name: "kkb_code_location", arguments: { question: "persistVerifiedUpdate read-back" } } }) + "\n";
      for (const token of [session.token, ""]) {
        const output = execFileSync(process.execPath, ["--import", "tsx", "scripts/mcp-server.ts"], { encoding: "utf8", input, env: { ...process.env, KKB_SNAPSHOT: snapshotFile, KKB_EVENTS_FILE: eventsFile, KKB_MCP_SESSION_TOKEN: token, KKB_CODE_GRAPH: "" } });
        const response = JSON.parse(output);
        assert.equal(response.id, 9);
        if (token) assert.match(response.result.content[0].text, /blob\/1111111aaaaaaa\//);
        else assert.equal(response.result.isError, true);
      }
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
