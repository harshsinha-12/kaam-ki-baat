import type { Runtime } from "../lib/tools/runtime";
import { test } from "node:test";
import assert from "node:assert/strict";
import { EventStore } from "../lib/store/event-store";
import { RedisClient, RedisEventBackend, redisConfig } from "../lib/store/redis";
import { loadRuntimeSnapshot, validateHostedSnapshot } from "../lib/evidence/hosted";
import { issueDeviceSession, resolveDeviceActor } from "../lib/zones/identity";
import { testSnapshot } from "./helpers/snapshot";

function redisFixture() {
  const lists = new Map<string, string[]>(), values = new Map<string, string>();
  let unavailable = false;
  const config = { url: "https://redis.example", token: "synthetic-server-token", namespace: "test" };
  const transport: typeof fetch = async (_url, options) => {
    if (unavailable) return new Response("private provider details", {status:503});
    assert.equal((options?.headers as Record<string,string>).Authorization, "Bearer synthetic-server-token");
    const [command, ...args] = JSON.parse(String(options?.body));
    let result: unknown;
    if (command === "EVAL") {
      const [script, , key, ...argv] = args;
      if (script.includes("LLEN")) {
        const list = lists.get(key) ?? [];
        if (list.length !== Number(argv[0])) result = 0;
        else { list.push(...argv.slice(1)); lists.set(key, list); result = 1; }
      } else if (script.includes("LRANGE")) result = [...(lists.get(key) ?? [])];
      else if (script.includes("GET")) result = values.get(key) ?? null;
      else throw new Error("unsupported synthetic command");
    } else if (command === "RPUSH") { const [key, ...events] = args; const list = lists.get(key) ?? []; list.push(...events); lists.set(key,list); result=list.length; }
    else if (command === "SET") { const [key,value,mode] = args; if(mode==="NX"&&values.has(key))result=null;else {values.set(key,value);result="OK";} }
    else throw new Error("unsupported synthetic command");
    return Response.json({result});
  };
  return { config, transport, values, fail: () => { unavailable = true; }, store: () => new EventStore(null, new RedisEventBackend(new RedisClient(config,transport))) };
}

test("separate serverless store instances resolve the same persisted device identity", async () => {
  const fixture=redisFixture(),snapshot=testSnapshot();
  const session=await issueDeviceSession(fixture.store(),snapshot,{participantId:"dev",deviceLabel:"synthetic Vercel browser"});
  const actor=await resolveDeviceActor(fixture.store(),snapshot,session.token);
  assert.equal(actor.ok,true);
  if(actor.ok)assert.equal(actor.actor.participant.id,"dev");
  assert.equal((await resolveDeviceActor(fixture.store(),snapshot,"invalid-token-value")).ok,false);
});

test("distributed compare-and-append rejects competing stale writes atomically", async () => {
  const fixture=redisFixture(), stores=Array.from({length:8},()=>fixture.store());
  const results=await Promise.all(stores.map((store,index)=>store.appendGuarded<{won:boolean}>(events=>{
    if(events.length)return {reject:{won:false}};
    return {append:{type:"zone",kind:"focus",at:new Date().toISOString(),key:"device",data:{index}},result:{won:true}};
  })));
  assert.equal(results.filter(r=>r.won).length,1);
  assert.equal((await fixture.store().all()).length,1);
});

test("write retries across independent instances preserve one saved task update", async () => {
  const fixture=redisFixture();
  const record: Parameters<EventStore["writeOnce"]>[0]={id:"saved-record",taskId:"task",actorId:"dev",callId:null,status:"in_progress",idempotencyKey:"same-request-key",at:new Date().toISOString()};
  const results=await Promise.all(Array.from({length:8},()=>fixture.store().writeOnce(record)));
  assert.equal(results.filter(r=>!r.replayed).length,1);
  assert.deepEqual(await fixture.store().read(record.id),record);
});

test("hosted failures are surfaced without exposing credentials or provider response bodies", async () => {
  const fixture=redisFixture();
  const client=new RedisClient(fixture.config,async()=>new Response("synthetic-server-token private provider detail",{status:503}));
  await assert.rejects(client.get("key"),error=>error instanceof Error&&error.message==="Hosted storage unavailable (503).");
  assert.throws(()=>redisConfig({UPSTASH_REDIS_REST_URL:"https://user:password@redis.example",UPSTASH_REDIS_REST_TOKEN:"secret"}),/credential-free/);
  assert.throws(()=>redisConfig({UPSTASH_REDIS_REST_URL:"https://redis.example"}),/both/);
  assert.equal(redisConfig({}),null);
  assert.deepEqual(validateHostedSnapshot(testSnapshot()),testSnapshot());
  assert.throws(()=>validateHostedSnapshot({files:[]}),/invalid/);
});

test("hosted snapshot loading ignores copied Mac paths and keeps auth/source data server-side", async () => {
  const fixture=redisFixture(), snapshot=testSnapshot();
  fixture.values.set("test:snapshot",JSON.stringify(snapshot));
  const keys=["UPSTASH_REDIS_REST_URL","UPSTASH_REDIS_REST_TOKEN","KKB_STORAGE_NAMESPACE","KKB_SNAPSHOT","VERCEL"];
  const saved=keys.map(k=>process.env[k]), transport=globalThis.fetch;
  try {
    process.env.UPSTASH_REDIS_REST_URL=fixture.config.url;process.env.UPSTASH_REDIS_REST_TOKEN=fixture.config.token;
    process.env.KKB_STORAGE_NAMESPACE="test";process.env.KKB_SNAPSHOT="/Users/mac-only/private/snapshot.json";process.env.VERCEL="1";globalThis.fetch=fixture.transport;
    assert.deepEqual(await loadRuntimeSnapshot(),snapshot);
    fixture.values.delete("test:snapshot");
    await assert.rejects(loadRuntimeSnapshot(),/not been imported/);
    delete process.env.UPSTASH_REDIS_REST_URL;delete process.env.UPSTASH_REDIS_REST_TOKEN;
    await assert.rejects(loadRuntimeSnapshot(),/not configured/);
    const {runtimeStore}=await import("../lib/store/runtime-store");
    assert.throws(()=>runtimeStore(),/not configured/);
  } finally { globalThis.fetch=transport;keys.forEach((key,i)=>saved[i]===undefined?delete process.env[key]:process.env[key]=saved[i]); }
});

test("migration is repeatable, reads back the audit and refuses divergent histories", async () => {
  const { migrateHosted } = await import("../lib/store/migrate");
  const fixture = redisFixture(), client = new RedisClient(fixture.config,fixture.transport);
  const local = new EventStore(null), snapshot = testSnapshot();
  const issued = await issueDeviceSession(local,snapshot,{participantId:"dev",deviceLabel:"migrated browser"});
  const events = await local.all();
  const first = await migrateHosted(client,snapshot,events);
  assert.deepEqual(await migrateHosted(client,snapshot,events),first);
  assert.equal(first.eventCount,events.length);
  assert.equal((await resolveDeviceActor(fixture.store(),snapshot,issued.token)).ok,true);
  await assert.rejects(migrateHosted(client,snapshot,[]),/differs/);
  assert.equal((await fixture.store().all()).length,events.length);
});

test("cross-instance leases exclude a duplicate provider request and permit explicit retry after release", async () => {
  const { acquireLease } = await import("../lib/store/lease");
  const fixture=redisFixture();
  const results=await Promise.all(Array.from({length:8},()=>acquireLease(fixture.store(),"same-device")));
  const winner=results.find(r=>r!==null);
  assert.equal(results.filter(Boolean).length,1);
  assert.ok(winner);await winner();
  const retry=await acquireLease(fixture.store(),"same-device");assert.ok(retry);await retry();
});

test("conversation cards and communication ledger survive a fresh runtime instance", async () => {
  const { issueCallSession } = await import("../lib/auth/call-session");
  const { runTool } = await import("../lib/tools/runtime");
  const { restoreConversations } = await import("../lib/store/conversation");
  const fixture=redisFixture(), snapshot=testSnapshot();
  const first: Runtime={store:fixture.store(),snapshot,conversations:new Map()};
  const session=await issueCallSession(first.store,{participantId:"dev",meetingIds:["m1"],repository:snapshot.repository,consentRecordedBy:"synthetic",scenario:"serverless test"});
  assert.equal((await runTool(first,"get_my_brief",{call_token:session.token})).status,200);
  const fresh: Runtime={store:fixture.store(),snapshot,conversations:new Map()};
  await restoreConversations(fresh);
  assert.deepEqual(fresh.conversations.get(session.session.callId),first.conversations.get(session.session.callId));
  assert.ok(fresh.conversations.get(session.session.callId)?.ledger.items.length);
  const wrongSnapshot: Runtime={store:fixture.store(),snapshot:{...snapshot,pinnedSha:"new-snapshot"},conversations:new Map()};
  await restoreConversations(wrongSnapshot);assert.equal(wrongSnapshot.conversations.size,0);
});

test("Vercel HTTP routes recover imported auth and source highlights after instance replacement", async () => {
  const fixture=redisFixture(), snapshot=testSnapshot();
  fixture.values.set("test:snapshot",JSON.stringify(snapshot));
  const session=await issueDeviceSession(fixture.store(),snapshot,{participantId:"dev",deviceLabel:"synthetic hosted HTTP"});
  const keys=["UPSTASH_REDIS_REST_URL","UPSTASH_REDIS_REST_TOKEN","KKB_STORAGE_NAMESPACE","KKB_SNAPSHOT_KEY","VERCEL"];
  const saved=keys.map(k=>process.env[k]), transport=globalThis.fetch;
  const global=globalThis as unknown as {__kkbRuntime?:Runtime;__kkbRuntimePromise?:Promise<Runtime>};
  const oldRuntime=global.__kkbRuntime,oldPromise=global.__kkbRuntimePromise;
  const { POST }=await import("../app/api/zones/[action]/route");
  const reset=()=>{delete global.__kkbRuntime;delete global.__kkbRuntimePromise;};
  const request=(token:string,body:object)=>new Request("https://hosted.example/api/zones/action",{method:"POST",headers:{Authorization:`Session ${token}`,"Content-Type":"application/json"},body:JSON.stringify(body)});
  try {
    process.env.UPSTASH_REDIS_REST_URL=fixture.config.url;process.env.UPSTASH_REDIS_REST_TOKEN=fixture.config.token;
    process.env.KKB_STORAGE_NAMESPACE="test";delete process.env.KKB_SNAPSHOT_KEY;process.env.VERCEL="1";globalThis.fetch=fixture.transport;reset();
    assert.equal((await POST(request(session.token,{}),{params:Promise.resolve({action:"me"})})).status,200);
    assert.equal((await POST(request(session.token,{path:"lib/core/persist-update.ts",line:6,endLine:8}),{params:Promise.resolve({action:"code_open"})})).status,200);
    reset();
    const response=await POST(request(session.token,{}),{params:Promise.resolve({action:"code_focus"})});
    const data=await response.json();
    assert.equal(response.status,200);assert.equal(data.focus.path,"lib/core/persist-update.ts");
    assert.deepEqual(data.focus.highlights.map((h:{start:number;end:number})=>[h.start,h.end]),[[6,8]]);
    assert.equal((await POST(request("invalid-token",{}),{params:Promise.resolve({action:"code_files"})})).status,401);
    const {GET:health}=await import("../app/api/health/route");
    assert.equal((await health()).status,200);
    fixture.fail();
    const unavailable=await health();assert.equal(unavailable.status,503);
    const status=await unavailable.json();assert.equal(status.snapshot.loaded,false);
    assert.doesNotMatch(JSON.stringify(status),/private provider details|mac-only|synthetic-server-token/);
  } finally {
    globalThis.fetch=transport;global.__kkbRuntime=oldRuntime;global.__kkbRuntimePromise=oldPromise;
    keys.forEach((key,i)=>saved[i]===undefined?delete process.env[key]:process.env[key]=saved[i]);
  }
});

test("hosted evaluations persist without writing the Mac-only evaluation directory", async () => {
  const fixture=redisFixture(), agent="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", execution="bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  const keys=["UPSTASH_REDIS_REST_URL","UPSTASH_REDIS_REST_TOKEN","KKB_STORAGE_NAMESPACE","KKB_EVAL_DIR","BOLNA_API_KEY","BOLNA_AGENT_ID"];
  const saved=keys.map(k=>process.env[k]), transport=globalThis.fetch;
  try {
    process.env.UPSTASH_REDIS_REST_URL=fixture.config.url;process.env.UPSTASH_REDIS_REST_TOKEN=fixture.config.token;
    process.env.KKB_STORAGE_NAMESPACE="test";process.env.KKB_EVAL_DIR="/unavailable-mac/evaluations";process.env.BOLNA_AGENT_ID=agent;process.env.BOLNA_API_KEY="synthetic-bolna-key";
    globalThis.fetch=async (url,options)=>{
      if(String(url).startsWith(fixture.config.url))return fixture.transport(url,options);
      assert.equal(new URL(String(url)).hostname,"api.bolna.ai");
      assert.equal(options?.method,undefined,"evaluation refresh only reads the provider");
      if(String(url).includes('/debug'))return Response.json({execution_id:execution,execution:{agent_id:agent}});
      return Response.json({data:[{id:execution,agent_id:agent,status:"completed",conversation_duration:48}],has_more:false});
    };
    const {syncDashboard,readDashboard}=await import("../lib/eval/dashboard-store");
    const dashboard=await syncDashboard();assert.equal(dashboard.calls.length,1);
    assert.deepEqual(await readDashboard(),dashboard);
    assert.ok(fixture.values.has("test:eval:latest"));
    assert.doesNotMatch(fixture.values.get("test:eval:latest")!,/synthetic-bolna-key/);
    const historical=structuredClone(dashboard);historical.syncedAt=new Date(Date.now()-120000).toISOString();historical.calls[0].review="Previously authored review retained after migration.";
    fixture.values.set("test:eval:latest",JSON.stringify(historical));
    assert.equal((await syncDashboard()).calls[0].review,historical.calls[0].review);
  } finally {globalThis.fetch=transport;keys.forEach((key,i)=>saved[i]===undefined?delete process.env[key]:process.env[key]=saved[i]);}
});
