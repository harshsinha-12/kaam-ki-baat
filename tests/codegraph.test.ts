import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildCodeGraph, queryGraph, resolveImport } from "../lib/codegraph/graph";
import { zoneSetup } from "./helpers/zones";
import { getCodeGraph } from "../lib/codegraph/load";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const files = [
  { path: "lib/store.ts", content: "// Append-only store with read-back.\nexport async function persistUpdate(x) {\n  // write then read back before saying saved\n  return read(x);\n}\nexport interface SavedThing { id: string }\n" },
  { path: "lib/api.ts", content: "import { persistUpdate } from \"./store\";\nexport function handle() { return persistUpdate(1); }\n" },
  { path: "lib/ui.tsx", content: "import { handle } from \"@/lib/api\";\nexport const View = () => handle();\n" },
  { path: "tests/store.test.ts", content: "import { persistUpdate } from \"../lib/store\";\n// fixture mentions read back saved read back saved\n" },
];

describe("code graph (Graphify-style)", () => {
  const g = buildCodeGraph("o/r", "abc1234", files);
  it("resolves relative and @/ imports, and links tests", () => {
    assert.equal(resolveImport("lib/api.ts", "./store", new Set(["lib/store.ts"])), "lib/store.ts");
    assert.ok(g.edges.some((e) => e.from === "file:lib/ui.tsx" && e.to === "file:lib/api.ts" && e.kind === "imports"));
    assert.ok(g.edges.some((e) => e.from === "file:tests/store.test.ts" && e.kind === "tests"));
  });
  it("answers with the function (not a type or a test fixture), and explains the path", () => {
    const a = queryGraph(g, "where do we read back before saying saved", files);
    assert.equal(a.seed?.label, "persistUpdate");
    assert.equal(a.seed?.line, 2);
    assert.match(a.explanation.join(" "), /called from lib\/api\.ts/);
    assert.match(a.explanation.join(" "), /related test file tests\/store\.test\.ts/);
    assert.equal(a.match, "candidate");
    assert.equal(queryGraph(g, "read back saved", files, new Set(["lib/store.ts"])).match, "candidate");
  });
  it("returns none instead of guessing", () => {
    assert.equal(queryGraph(g, "kubernetes helm chart", files).match, "none");
  });
  it("is repo-gated through the zones API", async () => {
    const z = await zoneSetup();
    assert.equal((await z.act(z.outsider, "code_graph_query", { question: "persistVerifiedUpdate" })).status, 403);
    const ok = await z.act(z.mate, "code_graph_query", { question: "persistVerifiedUpdate read-back" });
    assert.equal(ok.status, 200);
    assert.equal((ok.body.seed as { label: string }).label, "persistVerifiedUpdate");
    assert.equal(ok.body.match, "candidate"); // No caller-selected task/PR link.
    const graph = ok.body.graph as { nodes: unknown[]; edges: unknown[]; sha: string };
    assert.equal(graph.sha, z.snapshot.pinnedSha);
    assert.ok(graph.nodes.length > 0 && graph.nodes.length <= 600);
    assert.ok(graph.edges.length <= 1800);
    assert.equal((await z.act(z.mate, "code_graph_query", { question: "persistVerifiedUpdate", task_id: "t1" })).status, 403);
  });
  it("does not reuse a graph from a broader snapshot with the same SHA", async () => {
    const z = await zoneSetup();
    const broad = getCodeGraph(z.snapshot);
    const narrow = getCodeGraph({ ...z.snapshot, files: [] });
    assert.ok(broad.nodes.length > 0);
    assert.equal(narrow.nodes.length, 0);
  });
  it("keeps LIVE graph artifacts private and refuses public demo generation", async () => {
    const z = await zoneSetup();
    const directory = mkdtempSync(path.join(tmpdir(), "kkb-graph-output-"));
    const snapshot = path.join(directory, "source.json");
    writeFileSync(snapshot, JSON.stringify({ ...z.snapshot, label: "LIVE" }));
    const script = path.resolve("scripts/build-codegraph.ts");
    const args = ["--import", import.meta.resolve("tsx"), script];
    const options = { cwd: directory, env: { ...process.env, KKB_SNAPSHOT: snapshot, KKB_CODE_GRAPH: "" }, stdio: "pipe" as const };
    try {
      execFileSync(process.execPath, args, options);
      assert.ok(JSON.parse(readFileSync(path.join(directory, "data/private/codegraph/codegraph.json"), "utf8")).nodes.length > 0);
      assert.throws(() => execFileSync(process.execPath, [...args, "--demo"], options), /Public graph examples require a FIXTURE/);
      assert.equal(existsSync(path.join(directory, "data/demo")), false);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
