import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCodeGraph } from "../lib/codegraph/graph";
import { buildSearchIndex, expand, grepFiles, search, splitIdent, tokenize, type SearchIndex } from "../lib/codegraph/search";

// A small synthetic repo: plain-language questions must reach the right
// function even when they share no words with its name.
const files = [
  { path: "lib/auth/webauthn.ts", content: "// Passkey (Touch ID) verification for the leader.\nexport function assertPasskey(sig: string) {\n  // check signature counter so a cloned key is refused\n  return verifySignature(sig);\n}\nexport function verifySignature(s: string) { return s.length > 0; }\n" },
  { path: "lib/store/persist.ts", content: "// Append-only store.\nexport async function persistVerifiedUpdate(x: string) {\n  // write, then read back before saying saved\n  return x;\n}\n" },
  { path: "lib/motion/curves.ts", content: "// Exponential decay smoothing, independent of frame rate.\nexport function damp(a: number, b: number, lambda: number, dt: number) {\n  return b + (a - b) * Math.exp(-lambda * dt);\n}\n" },
  { path: "app/api/leader/route.ts", content: "import { assertPasskey } from \"../../../lib/auth/webauthn\";\nexport function POST(sig: string) { return assertPasskey(sig); }\n" },
  { path: "tests/passkey.test.ts", content: "import { assertPasskey } from \"../lib/auth/webauthn\";\nassertPasskey(\"x\");\n" },
];
const g = buildCodeGraph("demo/repo", "abc1234", files);
const idx = buildSearchIndex(g, files);

describe("code search", () => {
  it("splits identifiers and expands concepts", () => {
    assert.deepEqual(splitIdent("persistVerifiedUpdate"), ["persist", "verified", "update"]);
    assert.ok(tokenize("How does the lead prove it's them?").includes("lead"));
    const ex = expand(["fingerprint"]).map((e) => e.term);
    assert.ok(ex.some((t) => t.startsWith("passkey") || t === "webauthn" || t === "touch"), `fingerprint expands toward passkey: ${ex.join(",")}`);
  });

  it("keyword mode finds an exact identifier", () => {
    const hits = search(idx, g, "persistVerifiedUpdate", "keyword", 5);
    assert.equal(hits[0]?.label, "persistVerifiedUpdate");
  });

  it("semantic mode answers a plain-language question with no shared name", () => {
    const hits = search(idx, g, "how does the lead prove it's them with a fingerprint", "semantic", 5);
    assert.equal(hits[0]?.label, "assertPasskey");
    assert.ok(hits[0].why.length > 0, "every hit explains why it ranked");
  });

  it("semantic mode finds frame-rate independent smoothing", () => {
    const hits = search(idx, g, "smooth animation that does not depend on frame rate", "semantic", 3);
    assert.equal(hits[0]?.label, "damp");
  });

  it("grep baseline only returns files", () => {
    const hits = grepFiles(files, "passkey", 3);
    assert.ok(hits.length > 0 && hits.every((h) => typeof h === "string"));
  });

  it("the shipped demo index beats bm25 on plain-language questions", () => {
    const graph = JSON.parse(readFileSync("data/demo/codegraph.json", "utf8"));
    const shipped = JSON.parse(readFileSync("data/demo/codesearch.json", "utf8")) as SearchIndex;
    assert.equal(shipped.sha, graph.sha, "index and graph are pinned to the same commit");
    const cases: [string, string[]][] = [
      ["how does the lead prove it's them with a fingerprint", ["assertPasskey", "registerPasskey", "stepUp"]],
      ["smooth animation that does not depend on frame rate", ["damp"]],
      ["turn a list of points into a smooth curve", ["catmullRomToBezier", "bsplineToBezier"]],
      ["create a single use token for a phone call", ["issueCallSession"]],
    ];
    const at3 = (mode: "bm25" | "semantic") => cases.filter(([q, want]) => search(shipped, graph, q, mode, 3).some((h) => want.includes(h.label))).length;
    assert.ok(at3("semantic") >= at3("bm25"), "semantic is never worse than bm25 here");
    assert.ok(at3("semantic") >= 3, `semantic hit@3 ${at3("semantic")}/4`);
  });
});
