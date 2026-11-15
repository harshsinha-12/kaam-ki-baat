import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildCodeGraph, queryGraph, resolveImport } from "../lib/codegraph/graph";
import { zoneSetup } from "./helpers/zones";

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
    assert.match(a.explanation.join(" "), /covered by tests\/store\.test\.ts/);
    assert.equal(a.match, "candidate");
    assert.equal(queryGraph(g, "read back saved", files, new Set(["lib/store.ts"])).match, "confirmed");
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
  });
});
