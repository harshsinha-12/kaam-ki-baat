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
test("the same voice session follows current confirmed head selection without leader privilege", async () => {
  const s=snapshot(),store=new EventStore(null),rt={snapshot:s,store,conversations:new Map()};
  s.meetings=[{id:"allowed",title:"Team notes",source:"FIXTURE",approvedBy:"test"}];
  s.passages=[{kind:"meeting",id:"allowed#1",meetingId:"allowed",charStart:0,charEnd:20,text:"Permitted team note",visibility:"participant"},{kind:"meeting",id:"private#1",meetingId:"private",charStart:0,charEnd:12,text:"PRIVATE NOTE",visibility:"participant"}];
  s.participants[0].meetingIds=["allowed"];
  const {issueDeviceSession}=await import("../lib/zones/identity");
  const {ev}=await import("../lib/zones/state");
  const device=await issueDeviceSession(store,s,{participantId:"member",deviceLabel:"synthetic camera"});
  const {token,session}=await issueCallSession(store,{participantId:"member",meetingIds:["allowed"],repository:s.repository,consentRecordedBy:"synthetic",scenario:"project-test"});
  await store.append(ev("project_voice_binding",session.callId,{deviceSessionId:device.session.sessionId,participantId:"member"}));
  await store.append(ev("focus_input",device.session.sessionId,{provider:"webcam",epoch:1}));
  for(const [index,zone]of ["team_memory","code_navigator","leader_desk"].entries()){
    await store.append(ev("focus",device.session.sessionId,{zone,provider:"webcam",seq:index+1,inputEpoch:1}));
    const r=await runTool(rt,"get_project_context",{call_token:token,question:"What is the context?"});
    assert.equal(r.status,200);assert.equal(r.body.selectedZone,zone);
    assert.ok(!JSON.stringify(r.body).includes("PRIVATE NOTE"));
    if(zone==="team_memory")assert.ok(JSON.stringify(r.body).includes("Permitted team note"));
  }
  assert.equal((await store.all()).filter(e=>e.type==="zone"&&["step_up","activation","decision"].includes(e.kind)).length,0);
});
