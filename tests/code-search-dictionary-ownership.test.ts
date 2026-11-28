import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSearchIndex, expand, search, tokenize } from "../lib/codegraph/search";
import type { CodeGraph } from "../lib/codegraph/graph";
test("ordinary constructor identifiers are data, not inherited dictionary properties", () => {
  const graph = { sha: "a", repository: "team/repo", nodes: [{ id: "sym", kind: "class", label: "constructor", path: "worker.ts", line: 1 }], edges: [] } as unknown as CodeGraph;
  const index = buildSearchIndex(graph, [{ path: "worker.ts", content: "class Worker { constructor() { this.ready = true; } }" }]);
  assert.equal(index.df.constructor as unknown, 1);
  assert.deepEqual(expand(tokenize("constructor")), [{ term: "constructor", w: 1 }]);
  for (const mode of ["bm25", "semantic"] as const) {
    const hits = search(index, graph, "constructor", mode);
    assert.equal(hits[0]?.id, "sym");
    assert.ok(Number.isFinite(hits[0]?.score));
  }
});
