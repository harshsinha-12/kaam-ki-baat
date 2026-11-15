import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { handle } from "../scripts/mcp-server";

describe("MCP server (stdio JSON-RPC)", () => {
  it("initializes and lists four read-only tools", () => {
    assert.equal((handle({ id: 1, method: "initialize" }) as { result: { serverInfo: { name: string } } }).result.serverInfo.name, "kaam-ki-baat");
    const tools = (handle({ id: 2, method: "tools/list" }) as { result: { tools: { name: string }[] } }).result.tools.map((t) => t.name);
    assert.deepEqual(tools, ["kkb_code_location", "kkb_decisions", "kkb_task_status", "kkb_graph_report"]);
  });
  it("answers a code question with a SHA-pinned link and unknown tools are errors", () => {
    const r = handle({ id: 3, method: "tools/call", params: { name: "kkb_code_location", arguments: { question: "persistVerifiedUpdate read-back" } } }) as { result: { content: { text: string }[] } };
    assert.match(r.result.content[0].text, /blob\/[0-9a-f]{40}\//);
    const bad = handle({ id: 4, method: "tools/call", params: { name: "approve_everything" } }) as { result: { isError: boolean } };
    assert.equal(bad.result.isError, true);
    assert.equal(handle({ method: "notifications/initialized" }), null);
  });
});
