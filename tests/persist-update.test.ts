import {describe,it,expect} from "vitest";
import {persistVerifiedUpdate,type UpdateRepository,type SavedUpdate} from "../lib/core/persist-update";
const raw={taskId:"t1",intendedStatus:"blocked" as const,confirmation:true as const,idempotencyKey:"call-001-a"};
describe("tool postconditions",()=>{
 it("refuses unauthorized identity",async()=>{const repository:UpdateRepository={writeOnce:async()=>({id:"a"}),read:async()=>null};expect((await persistVerifiedUpdate({raw,trustedActorId:null,authorizedTaskIds:new Set(["t1"]),repository,generateId:()=> "x"})).saved).toBe(false)});
 it("refuses save claim without readback",async()=>{const repository:UpdateRepository={writeOnce:async()=>({id:"a"}),read:async()=>null};expect((await persistVerifiedUpdate({raw,trustedActorId:"a",authorizedTaskIds:new Set(["t1"]),repository,generateId:()=> "x"})).saved).toBe(false)});
 it("requires successful persisted readback",async()=>{
  let saved:SavedUpdate|null=null;const repository:UpdateRepository={writeOnce:async r=>{saved=r;return {id:r.id}},read:async()=>saved};
  expect(await persistVerifiedUpdate({raw,trustedActorId:"a",authorizedTaskIds:new Set(["t1"]),repository,generateId:()=> "id-1"})).toEqual({saved:true,recordId:"id-1"});
 });
});
