import {describe,it,expect} from "vitest";
import {newReport,markAttempted,confirmHeard,markInterrupted,outstandingFacts} from "../lib/core/communication-ledger";
describe("communication ledger",()=>{
 it("interruption does not mean all facts were heard",()=>{
  const report=markInterrupted(markAttempted(newReport("c1",[{id:"sha",fact:"CI is stale"},{id:"next",fact:"Rerun checks"}]),"sha"));
  expect(outstandingFacts(report).map(f=>f.id)).toEqual(["sha","next"]);
 });
 it("explicit acknowledgement requires attempted announcement",()=>{
  const r=newReport("c1",[{id:"a",fact:"A"}]);expect(()=>confirmHeard(r,"a")).toThrow();
  expect(outstandingFacts(confirmHeard(markAttempted(r,"a"),"a"))).toEqual([]);
 });
});
