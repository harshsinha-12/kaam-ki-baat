import {describe,it,expect} from "vitest";
import {reconcileWorkItem} from "../lib/core/reconcile";
import type {WorkItemRecord} from "../lib/contracts";
const t:WorkItemRecord={id:"t1",title:"Memory fix",assignment:{state:"discussed",ownerId:"a",evidenceRefIds:[]},pullRequest:{state:"open",repository:"team/repo",number:7,headSha:"f00ba7"},checks:[{commitSha:"f00ba6",conclusion:"success",name:"test",evidenceRefId:"check-1"}],evidence:[]};
describe("reconciliation",()=>{
 it("does not accept discussed ownership",()=>expect(reconcileWorkItem(t).acceptedOwnerId).toBeNull());
 it("open PR and stale SHA remain unverified",()=>{const r=reconcileWorkItem(t);expect(r.implementation).toBe("open");expect(r.verification).toBe("stale");expect(r.productionVerified).toBe(false)});
 it("same-SHA check cannot imply PR merged",()=>{const r=reconcileWorkItem({...t,checks:[{...t.checks[0],commitSha:"f00ba7"}]});expect(r.verification).toBe("check_passed_for_head");expect(r.implementation).toBe("open")});
});
