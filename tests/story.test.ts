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

test("an unrelated question says so instead of guessing", () => {
  const t = traceTrail(story, "zzz qqq");
  assert.equal(t.prs.length, 0);
  assert.match(t.sentences[0], /couldn't tie that/);
});
