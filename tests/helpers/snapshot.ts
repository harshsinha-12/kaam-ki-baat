import type { EvidenceSnapshot } from "../../lib/contracts";

// FIXTURE: small synthetic snapshot for unit tests only.
export function testSnapshot(): EvidenceSnapshot {
  return {
    label: "FIXTURE",
    repository: "team/repo",
    pinnedSha: "1111111aaaaaaa",
    fetchedAt: "2026-11-15T08:00:00.000Z",
    meetings: [{ id: "m1", title: "Sync", source: "FIXTURE", approvedBy: "test" }, { id: "m2", title: "Private", source: "FIXTURE", approvedBy: "test" }],
    passages: [{ kind: "meeting", id: "m1#1", meetingId: "m1", speaker: "Lead", charStart: 0, charEnd: 40, text: "Only say saved after read-back.", visibility: "participant" }],
    files: [
      { path: "lib/core/persist-update.ts", content: "import x from 'y';\n\nexport async function persistVerifiedUpdate(args) {\n  // read-back before success\n  const written = await withTimeout(write(), 3000);\n  const actual = await withTimeout(repository.read(written.id), 3000);\n  if (!actual) return { saved: false, reason: \"read-back failed\" };\n  return { saved: true };\n}\n" },
      { path: "lib/other.ts", content: "// mentions read-back in passing\nexport const other = 1;\n" },
      { path: "tests/persist-update.test.ts", content: "import { persistVerifiedUpdate } from \"../lib/core/persist-update\";\nit('requires read-back', () => {});\n" },
    ],
    pullRequests: [{ kind: "pr", id: "pr:2", repository: "team/repo", number: 2, title: "evidence core", state: "open", headSha: "2222222bbbbbbb", changedFiles: ["lib/core/persist-update.ts"], url: "https://github.com/team/repo/pull/2" }],
    checks: [{ kind: "check", id: "check:1", repository: "team/repo", commitSha: "0000000ccccccc", name: "test", conclusion: "success" }],
    tasks: [
      { id: "t1", title: "only say saved after read-back", meetingId: "m1", passageIds: ["m1#1"], assignment: { state: "accepted", ownerId: "dev" }, prNumber: 2, searchTerms: ["persistverifiedupdate", "read-back"] },
      { id: "t_private", title: "secret", meetingId: "m2", passageIds: [], assignment: { state: "accepted", ownerId: "dev" }, searchTerms: [] },
      { id: "t_lead", title: "lead task", meetingId: "m1", passageIds: [], assignment: { state: "accepted", ownerId: "lead" }, searchTerms: [] },
      { id: "t_disputed", title: "disputed", meetingId: "m1", passageIds: [], assignment: { state: "disputed" }, searchTerms: [] },
    ],
    participants: [
      { id: "dev", name: "Dev", meetingIds: ["m1"], taskIds: ["t1", "t_private", "t_disputed"] },
      { id: "lead", name: "Lead", meetingIds: ["m1"], taskIds: ["t_lead"] },
    ],
  };
}
