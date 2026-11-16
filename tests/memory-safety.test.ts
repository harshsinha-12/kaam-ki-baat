import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { EvidenceSnapshot } from "../lib/contracts";
import type { Actor } from "../lib/zones/identity";
import { askTeamMemory } from "../lib/zones/memory";

// Guards from scripts/eval-memory.ts: reworded questions may miss, but Team Memory
// must never call something confirmed that was not, or answer what was never said.
const snapshot = JSON.parse(readFileSync("data/demo/snapshot.fixture.json", "utf8")) as EvidenceSnapshot;
const member = snapshot.participants.find((p) => p.role !== "leader")!;
const actor: Actor = { participant: member, role: "member", repoAccess: true, sessionId: "t", channel: "device", stepUpFresh: false, meetingIds: member.meetingIds };

describe("Team Memory safety", () => {
  it("a synonym finds a reworded decision but keeps it unconfirmed", () => {
    const a = askTeamMemory(snapshot, [], actor, "when do we stop merging code today?");
    assert.equal(a.kind, "not_confirmed");
  });
  it("never confirms what was never discussed", () => {
    for (const q of ["which database are we using in production?", "did we agree to ship a dark mode?", "what did the work trend index say about meetings?"]) {
      assert.notEqual(askTeamMemory(snapshot, [], actor, q).kind, "confirmed", q);
    }
  });
});
