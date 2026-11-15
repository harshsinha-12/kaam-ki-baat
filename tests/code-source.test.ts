import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { publishSource, questionSource, readSource, sourceExcerpt, type CodeSourceFocus } from "../lib/codegraph/source";
import { EventStore } from "../lib/store/event-store";
import { ev, zoneEvents } from "../lib/zones/state";
import { runTool } from "../lib/tools/runtime";
import { runZoneAction } from "../lib/zones/service";
import { zoneSetup } from "./helpers/zones";
import { testSnapshot } from "./helpers/snapshot";
import { projectContext } from "../lib/project/context";

test("source excerpts use exact approved bytes, real line numbers and pinned canonical links", () => {
  const snapshot = testSnapshot();
  const source = sourceExcerpt(snapshot, "lib/core/persist-update.ts", [{ start: 6, end: 8, reason: "Read-back and success" }])!;
  assert.equal(source.sha, snapshot.pinnedSha);
  assert.equal(source.lines.find(l => l.n === 6)?.text, "  const actual = await withTimeout(repository.read(written.id), 3000);");
  assert.equal(source.url, `https://github.com/team/repo/blob/${snapshot.pinnedSha}/lib/core/persist-update.ts#L6-L8`);
  for (const [file, start, end] of [["../../.env", 1, 2], ["lib/other.ts", 0, 1], ["lib/other.ts", 2, 1], ["lib/other.ts", 1, 900], ["lib/other.ts", 1.5, 2]] as const)
    assert.equal(sourceExcerpt(snapshot, file, [{ start, end, reason: "invalid" }]), null);
});

test("opening source authenticates, rejects forged/out-of-snapshot requests and never activates", async () => {
  const z = await zoneSetup();
  for (const action of ["code_files", "code_open"] as const) {
    assert.equal((await runZoneAction(z.rt, action, "invalid", {})).status, 401);
    assert.equal((await z.act(z.outsider, action, { path: "lib/other.ts" })).status, 403);
  }
  const listing = await z.act(z.dev, "code_files");
  assert.deepEqual((listing.body.files as { path: string }[]).map(f => f.path), z.snapshot.files.map(f => f.path).sort());
  const opened = await z.act(z.dev, "code_open", { path: "lib/core/persist-update.ts", line: 6, endLine: 8 });
  assert.equal(opened.status, 200);
  const focus = opened.body.focus as CodeSourceFocus;
  assert.deepEqual(focus.highlights, [{ start: 6, end: 8, reason: "Selected source lines" }]);
  assert.deepEqual((await z.act(z.dev, "code_focus")).body.focus, focus);
  assert.equal((await z.act(z.mate, "code_focus")).body.focus, null, "another participant has no pointer to this person's source");
  for (const body of [{ path: "../.env" }, { path: "lib/other.ts", line: "1" }, { path: "lib/other.ts", line: 999 }, { path: "lib/other.ts", role: "leader" }, { path: "lib/other.ts", sha: "forged" }])
    assert.equal((await z.act(z.dev, "code_open", body)).status, 400);
  assert.equal(zoneEvents(await z.store.all()).filter(e => ["focus", "activation", "step_up", "decision"].includes(e.kind)).length, 0);
});

test("source focus is persisted/read back and reconstructed from the current allowed snapshot", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "kkb-source-test-"));
  try {
    const snapshot = testSnapshot(), file = path.join(directory, "events.jsonl");
    const source = sourceExcerpt(snapshot, "lib/other.ts", [{ start: 2, end: 2, reason: "Selected" }])!;
    const saved = await publishSource(new EventStore(file), "dev", source, "browse");
    assert.deepEqual(readSource(snapshot, await new EventStore(file).all(), "dev"), saved);
    assert.equal(readSource({ ...snapshot, pinnedSha: "new-sha" }, await new EventStore(file).all(), "dev"), null);
    assert.equal(readSource({ ...snapshot, repository: "different/repo" }, await new EventStore(file).all(), "dev"), null);
    assert.equal(readSource({ ...snapshot, files: [] }, await new EventStore(file).all(), "dev"), null);
    const legacy = ev("code_focus", "dev", { path: "lib/other.ts", sha: snapshot.pinnedSha,
      highlights: [{ start: 2, end: 2, reason: "Code" }], lines: [{ n: 2, text: "OLD PRIVATE BYTES" }], steps: [{ text: "PRIVATE MEETING" }] });
    const reconstructed = readSource(snapshot, [legacy], "dev");
    assert.ok(reconstructed);
    assert.doesNotMatch(JSON.stringify(reconstructed), /PRIVATE/);
    assert.match(JSON.stringify(reconstructed), /export const other/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("the current project voice tool publishes its code pointer, not just spoken excerpts", async () => {
  const z = await zoneSetup(), rt = { snapshot: z.snapshot, store: z.store, conversations: new Map() };
  const response = await runTool(rt, "get_project_context", { call_token: z.devCall.token, question: "Where does persistVerifiedUpdate read back repository data?" });
  assert.equal(response.status, 200);
  const focus = response.body.sourceFocus as CodeSourceFocus;
  assert.equal(focus.path, "lib/core/persist-update.ts");
  assert.equal(focus.from, "call");
  assert.ok(focus.highlights.some(h => h.start >= 3 && h.end <= 9));
  assert.deepEqual((await z.act(z.dev, "code_focus")).body.focus, focus);
  assert.equal((await z.act(z.mate, "code_focus")).body.focus, null);
  z.snapshot.participants.find(p => p.id === "dev")!.repoAccess = false;
  assert.equal((await runTool(rt, "get_project_context", { call_token: z.devCall.token, question: "persistVerifiedUpdate" })).status, 403);
  assert.equal((await z.act(z.dev, "code_focus")).status, 403);
});

test("questions without a permitted source do not invent highlights", () => {
  assert.equal(questionSource(testSnapshot(), "missing", []), null);
  assert.equal(questionSource(testSnapshot(), "missing", [{ path: ".env", lineStart: 1, lineEnd: 1 }]), null);
  assert.equal(questionSource(testSnapshot(), "unrelated-xylophone", [{ path: "lib/other.ts", lineStart: 1, lineEnd: 2 }]), null);
});

test("cross-system questions retrieve the imported meeting boundary and Bolna callback source", () => {
  const snapshot = testSnapshot();
  snapshot.files = [
    { path: "docs/integrations.md", content: "# Wispr and Bolna\nWispr MCP is read by the developer agent. Approved meeting data is imported; Bolna does not call Wispr directly." },
    { path: "scripts/build-snapshot.ts", content: "// Meeting JSON comes from an approved Wispr MCP read.\nexport function buildSnapshot(meeting) { return { passages: meeting.passages }; }" },
    { path: "lib/adapters/bolna.ts", content: "// Bolna uses HTTPS callbacks to read imported evidence.\nexport function buildBolnaTools(origin) {\n  return { url: origin + '/api/tools/get_my_brief' };\n}" },
  ];
  const context = projectContext(snapshot, "Where do we link Wispr MCP with Bolna AI?");
  assert.ok(context.passages.some(p => p.path === "scripts/build-snapshot.ts"));
  assert.ok(context.passages.some(p => p.path === "lib/adapters/bolna.ts"));
  assert.ok(context.passages.some(p => p.path === "docs/integrations.md"));
  const source = questionSource(snapshot, context.question, context.passages);
  assert.ok(source && snapshot.files.some(f => f.path === source.path));
  assert.ok(context.passages.every(p => p.retrieval.match === "candidate"));
  assert.match(context.instructions, /Do not invent/);
});
