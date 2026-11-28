import { test } from "node:test";
import assert from "node:assert/strict";
import storyData from "../data/demo/repo-story.json";
import { matchAreas, traceTrail, type RepoStory } from "../lib/story/trail";

const story = storyData as unknown as RepoStory;

test("repo story covers every merged PR in merge order, each with areas", () => {
  assert.ok(story.prs.length >= 30);
  const times = story.prs.map((p) => p.mergedAt);
  assert.deepEqual(times, [...times].sort());
  const ids = new Set(story.areas.map((a) => a.id));
  for (const p of story.prs) {
    assert.ok(p.areas.length > 0, `PR #${p.number} has no area`);
    for (const a of p.areas) assert.ok(ids.has(a), `PR #${p.number} has unknown area ${a}`);
    assert.ok(story.chapters.some((c) => c.id === p.chapter), `PR #${p.number} has unknown chapter`);
  }
});

test("a leader question traces back to where the Leader Desk started", () => {
  const t = traceTrail(story, "Who approves things when the leader wasn't clear?");
  assert.equal(t.areas[0].id, "leader");
  assert.equal(t.prs[0].number, 9);
  assert.match(t.sentences[1], /started with pull request 9/);
  assert.match(t.sentences.at(-1)!, /latest change is pull request/);
});

test("a head-turn question finds the input area, an explicit PR number wins", () => {
  assert.equal(matchAreas(story, "why doesn't turning my head with AirPods work")[0].id, "focus");
  const t = traceTrail(story, "what did PR #24 do?");
  assert.deepEqual(t.prs.map((p) => p.number), [24]);
  assert.match(t.sentences[0], /^Pull request 24/);
});

test("short keywords like CI still find their area", () => {
  assert.equal(matchAreas(story, "Did CI pass?")[0].id, "evidence");
  assert.equal(traceTrail(story, "what did PR #24 do?").lead, 0);
  assert.equal(traceTrail(story, "who approves on the leader desk?").lead, 1);
});

test("an unrelated question says so instead of guessing", () => {
  const t = traceTrail(story, "zzz qqq");
  assert.equal(t.prs.length, 0);
  assert.match(t.sentences[0], /couldn't tie that/);
});

test("an explicit PR number is not truncated to an existing prefix", () => {
  const expanded = {
    ...story,
    prs: [...story.prs, { ...story.prs[0]!, number: 1234 }],
  };
  const trail = traceTrail(expanded, "what did PR #12345 do?");
  assert.deepEqual(trail.prs, []);
  assert.match(trail.sentences[0]!, /12345/);
});

test("story references are not inferred from identifiers or repeated for the same PR", () => {
  assert.deepEqual(traceTrail(story, "inspect spr24").prs, []);
  assert.deepEqual(
    traceTrail(story, "what did PR 24 and pull request #24 do?").prs.map((pr) => pr.number),
    [24],
  );
});
