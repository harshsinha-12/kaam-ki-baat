import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { importGraphify } from "../lib/adapters/graphify";
import { codeScout } from "../lib/specialists/code-scout";
import { hasUsableCodeGraph } from "../lib/evidence/code-graph";
import { loadSnapshot } from "../lib/evidence/load";
import { issueCallSession } from "../lib/auth/call-session";
import { EventStore } from "../lib/store/event-store";
import { runTool, type Runtime } from "../lib/tools/runtime";
import { navigateCode } from "../lib/zones/code";
import type { Actor } from "../lib/zones/identity";
import { testSnapshot } from "./helpers/snapshot";

function graphSnapshot() {
  const s = testSnapshot();
  // The dependency has no query keyword. Keyword search cannot retrieve it.
  s.files.push({ path: "lib/store.ts", content: "export function durableAppend() {\n  return true;\n}\n" });
  s.codeGraph = importGraphify({
    graph: { schema_version: 1 },
    nodes: [
      { id: "persist", label: "persistVerifiedUpdate()", file_type: "code", source_file: "/scan/lib/core/persist-update.ts", source_location: "L3" },
      { id: "append", label: "durableAppend()", file_type: "code", source_file: "lib/store.ts", source_location: "L1" },
      { id: "out", label: "privateSecret", file_type: "code", source_file: "/elsewhere/secret.ts", source_location: "L1" },
      { id: "traversal", label: "privateSecret", file_type: "code", source_file: "../secret.ts", source_location: "L1" },
      { id: "meeting", label: "privateMeeting", file_type: "document", source_file: "lib/store.ts", source_location: "L1" },
      { id: "badline", label: "outOfRange", file_type: "code", source_file: "lib/store.ts", source_location: "L999" },
    ],
    links: [
      { source: "persist", target: "append", relation: "calls", confidence: "INFERRED" },
      { source: "persist", target: "out", relation: "calls", confidence: "EXTRACTED" },
    ],
  }, s, "/scan", "graphify 0.9.100");
  return s;
}

describe("Graphify code context", () => {
  it("links a task seed to a dependency without a keyword hit and preserves uncertain provenance", () => {
    const s = graphSnapshot();
    const findings = codeScout(s, s.tasks[0], "");
    assert.equal(findings[0].symbol, "persistVerifiedUpdate");
    assert.equal(findings[0].match, "confirmed");
    const related = findings.find((f) => f.path === "lib/store.ts")!;
    assert.equal(related.symbol, "durableAppend");
    assert.equal(related.excerpt, s.files.at(-1)!.content.trimEnd());
    assert.equal(related.match, "candidate");
    assert.deepEqual(related.retrieval?.via, { symbol: "persistVerifiedUpdate()", relation: "calls", confidence: "INFERRED", direction: "outgoing" });
    assert.match(related.url, /blob\/1111111aaaaaaa\/lib\/store.ts#L1-L3$/);
    assert.deepEqual(s.codeGraph!.nodes.map((n) => n.id), ["persist", "append"]);
  });

  it("preserves incoming relationships and extracted confidence, without upgrading them to confirmed", () => {
    const s = graphSnapshot();
    s.codeGraph!.edges[0].confidence = "EXTRACTED";
    s.pullRequests[0].changedFiles.push("lib/store.ts");
    const found = codeScout(s, undefined, "durableAppend");
    assert.equal(found[1].symbol, "persistVerifiedUpdate");
    assert.equal(found[1].retrieval?.via?.direction, "incoming");
    assert.equal(found[1].retrieval?.via?.confidence, "EXTRACTED");
    assert.equal(found[1].match, "candidate");
  });

  it("falls back for stale SHAs, wrong repositories, changed bytes, and malformed graphs", () => {
    for (const change of [
      (s: ReturnType<typeof graphSnapshot>) => { s.codeGraph!.commitSha = "old"; },
      (s: ReturnType<typeof graphSnapshot>) => { s.codeGraph!.repository = "other/repo"; },
      (s: ReturnType<typeof graphSnapshot>) => { s.files[0].content += "// changed"; },
      (s: ReturnType<typeof graphSnapshot>) => { s.codeGraph!.nodes[0].path = "../private.ts"; },
      (s: ReturnType<typeof graphSnapshot>) => { s.codeGraph!.nodes[0].line = 999; },
      (s: ReturnType<typeof graphSnapshot>) => { s.codeGraph = {} as never; },
    ]) {
      const s = graphSnapshot(); change(s);
      assert.equal(hasUsableCodeGraph(s), false);
      const found = codeScout(s, s.tasks[0], "");
      assert.equal(found[0].path, "lib/core/persist-update.ts");
      assert.equal(found.some((f) => f.retrieval), false);
    }
  });

  it("falls back on a graph miss and caps caller-requested output", () => {
    const s = graphSnapshot();
    s.files.push({ path: "lib/fallback.ts", content: "export const uncommonFallback = true;" });
    assert.equal(codeScout(s, undefined, "uncommonFallback")[0].path, "lib/fallback.ts");
    assert.equal(codeScout(s, s.tasks[0], "", 1).length, 1);
    assert.deepEqual(codeScout(s, s.tasks[0], "", 0), []);
  });

  it("accepts edges compatibility exports, rejects unknown shapes, and never trusts graph labels as source symbols", () => {
    const s = graphSnapshot();
    s.codeGraph!.nodes[0].label = "inventedSymbol";
    assert.equal(codeScout(s, undefined, "inventedSymbol")[0].symbol, undefined);
    assert.throws(() => importGraphify({ nodes: [] }, s, "/scan", "test"), /Unsupported/);
    const g = importGraphify({ nodes: [{ id: "f", label: "durableAppend()", file_type: "code", source_file: "lib/store.ts", source_location: "L1" }], edges: [] }, s, "/scan", "test");
    assert.equal(g.nodes.length, 1);
  });

  it("loads a bound private sidecar and safely falls back when it is missing or stale", () => {
    const root = mkdtempSync(path.join(tmpdir(), "kkb-graph-test-"));
    const oldSnapshot = process.env.KKB_SNAPSHOT, oldGraph = process.env.KKB_CODE_GRAPH;
    try {
      const s = graphSnapshot();
      const graph = s.codeGraph;
      delete s.codeGraph;
      writeFileSync(path.join(root, "snapshot.json"), JSON.stringify(s));
      writeFileSync(path.join(root, "graph.json"), JSON.stringify(graph));
      process.env.KKB_SNAPSHOT = "snapshot.json";
      process.env.KKB_CODE_GRAPH = "graph.json";
      assert.equal(codeScout(loadSnapshot(root), s.tasks[0], "")[1].path, "lib/store.ts");
      process.env.KKB_CODE_GRAPH = "missing.json";
      assert.equal(loadSnapshot(root).codeGraph, undefined);
      writeFileSync(path.join(root, "graph.json"), JSON.stringify({ ...graph, commitSha: "stale" }));
      process.env.KKB_CODE_GRAPH = "graph.json";
      assert.equal(loadSnapshot(root).codeGraph, undefined);
    } finally {
      if (oldSnapshot === undefined) delete process.env.KKB_SNAPSHOT; else process.env.KKB_SNAPSHOT = oldSnapshot;
      if (oldGraph === undefined) delete process.env.KKB_CODE_GRAPH; else process.env.KKB_CODE_GRAPH = oldGraph;
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("carries graph provenance through the authenticated task tool and refuses another task", async () => {
    const s = graphSnapshot();
    const rt: Runtime = { store: new EventStore(null), snapshot: s, conversations: new Map() };
    const { token } = await issueCallSession(rt.store, { participantId: "dev", meetingIds: ["m1"], repository: s.repository, consentRecordedBy: "synthetic test", scenario: "graph" });
    const response = await runTool(rt, "get_task_evidence", { call_token: token, task_id: "t1", focus: "find", question: "persistVerifiedUpdate" });
    assert.equal(response.status, 200);
    const evidence = response.body.evidence as Array<{ retrieval?: { via?: { confidence: string } } }>;
    assert.equal(evidence[1].retrieval?.via?.confidence, "INFERRED");
    const denied = await runTool(rt, "get_task_evidence", { call_token: token, task_id: "t_private", focus: "find" });
    assert.equal(denied.status, 403);
    assert.equal(denied.body.evidence, undefined);
    assert.equal((await runTool(rt, "get_task_evidence", { call_token: "forged-token-forged-token", focus: "find" })).status, 401);
  });

  it("preserves graph provenance and verified source ranges in the device Code Navigator", () => {
    const s = graphSnapshot();
    const actor: Actor = { participant: s.participants[0], role: "member", repoAccess: true, sessionId: "synthetic", channel: "device", stepUpFresh: false, meetingIds: ["m1"] };
    const response = navigateCode(s, actor, "persistVerifiedUpdate", "t1");
    assert.equal(response.ok, true);
    if (!response.ok) return;
    assert.equal(response.locations[1].verified, true);
    assert.equal(response.locations[1].match, "candidate");
    assert.equal(response.locations[1].retrieval?.via?.confidence, "INFERRED");
    assert.equal(navigateCode(s, { ...actor, repoAccess: false }, "persistVerifiedUpdate", "t1").ok, false);
  });
});
