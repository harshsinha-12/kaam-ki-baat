import test from "node:test";
import assert from "node:assert/strict";
import { projectContext, repositoryName } from "../lib/project/context";
import { issueCallSession } from "../lib/auth/call-session";
import { EventStore } from "../lib/store/event-store";
import { runTool } from "../lib/tools/runtime";
import type { EvidenceSnapshot } from "../lib/contracts";

const snapshot = (): EvidenceSnapshot => ({ label: "FIXTURE", repository: "team/repo", pinnedSha: "a".repeat(40), fetchedAt: new Date().toISOString(), meetings: [], passages: [], tasks: [], pullRequests: [], checks: [], participants: [{ id: "member", name: "Member", meetingIds: [], taskIds: [], repoAccess: true }], files: [{ path: "README.md", content: "# Project\nVoice guide for a team repository." }, { path: "lib/auth.ts", content: "export function authorize() { return false; }" }] });
test("repository URLs accept only an exact public GitHub repository", () => {
  assert.equal(repositoryName("https://github.com/team/repo.git"), "team/repo");
  for (const bad of ["https://github.com.evil.com/team/repo", "http://github.com/team/repo", "https://user:secret@github.com/team/repo", "https://github.com/team/repo/tree/main", "https://github.com/team/repo?x=1"]) assert.equal(repositoryName(bad), null);
});
test("project retrieval returns pinned source without meeting content", () => {
  const s = snapshot(); s.passages.push({kind:"meeting",id:"secret",meetingId:"private",charStart:0,charEnd:6,text:"SECRET",visibility:"participant"});
  const result = projectContext(s, "How does authorize work?");
  assert.ok(result.passages.some(p => p.path === "lib/auth.ts"));
  assert.ok(result.passages.every(p => p.url.includes(s.pinnedSha)));
  assert.ok(!JSON.stringify(result).includes("SECRET"));
});
test("project voice tool works without a meeting task and enforces repository access", async () => {
  const s = snapshot(), store = new EventStore(null), rt = { snapshot:s,store,conversations:new Map() };
  const {token} = await issueCallSession(store,{participantId:"member",meetingIds:[],repository:s.repository,consentRecordedBy:"synthetic test",scenario:"project-test"});
  assert.equal((await runTool(rt,"get_project_context",{call_token:token,question:"authorize"})).status,200);
  s.participants[0].repoAccess=false;
  assert.equal((await runTool(rt,"get_project_context",{call_token:token,question:"authorize"})).status,403);
  assert.equal((await runTool(rt,"get_project_context",{call_token:"invalid"})).status,401);
});
