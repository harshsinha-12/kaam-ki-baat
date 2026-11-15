import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { persistVerifiedUpdate, type SavedUpdate, type UpdateRepository } from "../lib/core/persist-update";
import { EventStore } from "../lib/store/event-store";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const raw = { taskId: "t1", intendedStatus: "blocked", confirmation: true, idempotencyKey: "call-001-a" };
const base = { authorizedTaskIds: new Set(["t1"]), generateId: () => "id-1", now: () => "2026-11-15T08:00:00.000Z" };

describe("tool postconditions", () => {
  it("refuses unauthorized identity", async () => {
    const repository: UpdateRepository = { writeOnce: async () => ({ id: "a", replayed: false }), read: async () => null };
    assert.equal((await persistVerifiedUpdate({ ...base, raw, trustedActorId: null, repository })).saved, false);
  });
  it("refuses a task the caller is not authorized for", async () => {
    const r = await persistVerifiedUpdate({ ...base, raw: { ...raw, taskId: "t2" }, trustedActorId: "a", repository: new EventStore(null) });
    assert.deepEqual(r, { saved: false, reason: "unauthorized" });
  });
  it("refuses unconfirmed updates", async () => {
    const r = await persistVerifiedUpdate({ ...base, raw: { ...raw, confirmation: false }, trustedActorId: "a", repository: new EventStore(null) });
    assert.equal(r.saved, false);
  });
  it("refuses save claim without readback", async () => {
    const repository: UpdateRepository = { writeOnce: async () => ({ id: "a", replayed: false }), read: async () => null };
    assert.equal((await persistVerifiedUpdate({ ...base, raw, trustedActorId: "a", repository })).saved, false);
  });
  it("a timed-out write is a failure, never 'saved'", async () => {
    const repository: UpdateRepository = { writeOnce: () => new Promise(() => {}), read: async () => null };
    const r = await persistVerifiedUpdate({ ...base, raw, trustedActorId: "a", repository, timeoutMs: 20 });
    assert.deepEqual(r, { saved: false, reason: "write failed or timed out" });
  });
  it("requires successful persisted readback", async () => {
    let saved: SavedUpdate | null = null;
    const repository: UpdateRepository = { writeOnce: async (r) => { saved = r; return { id: r.id, replayed: false }; }, read: async () => saved };
    const r = await persistVerifiedUpdate({ ...base, raw, trustedActorId: "a", repository });
    assert.equal(r.saved, true);
    assert.equal(r.saved && r.recordId, "id-1");
  });
  it("same idempotency key returns the first result; a different payload with that key is refused", async () => {
    const store = new EventStore(null);
    let n = 0;
    const gen = () => `id-${++n}`;
    const first = await persistVerifiedUpdate({ ...base, generateId: gen, raw, trustedActorId: "a", repository: store });
    const again = await persistVerifiedUpdate({ ...base, generateId: gen, raw, trustedActorId: "a", repository: store });
    assert.ok(first.saved && again.saved);
    assert.equal(first.saved && first.recordId, again.saved && again.recordId);
    assert.equal(again.saved && again.replayed, true);
    const conflict = await persistVerifiedUpdate({ ...base, generateId: gen, raw: { ...raw, intendedStatus: "in_progress" }, trustedActorId: "a", repository: store });
    assert.equal(conflict.saved, false);
    assert.equal((await store.all()).length, 1);
  });
  it("simultaneous retries persist one update and read back the same record", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "kkb-retry-"));
    try {
      const file = path.join(dir, "events.jsonl");
      const store = new EventStore(file);
      const results = await Promise.all(Array.from({ length: 10 }, (_, i) =>
        persistVerifiedUpdate({ ...base, generateId: () => `id-${i}`, raw, trustedActorId: "a", repository: store }),
      ));
      assert.ok(results.every((r) => r.saved));
      assert.equal(new Set(results.map((r) => r.saved && r.recordId)).size, 1);
      assert.equal(results.filter((r) => r.saved && !r.replayed).length, 1);
      assert.equal((await new EventStore(file).all()).length, 1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it("sees sessions appended by the separate call-token script after the store was loaded", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "kkb-session-"));
    try {
      const file = path.join(dir, "events.jsonl");
      const runtimeStore = new EventStore(file);
      await runtimeStore.all();
      const { issueCallSession } = await import("../lib/auth/call-session");
      const { session } = await issueCallSession(new EventStore(file), {
        participantId: "dev", meetingIds: ["m1"], repository: "team/repo", consentRecordedBy: "test", scenario: "test",
      });
      assert.equal((await runtimeStore.findCallByTokenHash(session.tokenHash))?.callId, session.callId);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
