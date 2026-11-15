import {WorkItem,type WorkItemRecord} from "../contracts";

export type Reconciled={
 taskId:string; ownerState:"discussed"|"proposed"|"accepted"; acceptedOwnerId:string|null;
 implementation:"none"|"open"|"closed_unmerged"|"merged";
 verification:"no_check"|"stale"|"pending"|"failed"|"check_passed_for_head";
 currentSha:string|null;productionVerified:false;warnings:string[];
};
export function reconcileWorkItem(raw:WorkItemRecord):Reconciled{
 const x=WorkItem.parse(raw),pr=x.pullRequest,warnings:string[]=[];
 const currentSha=pr.headSha??null;
 const acceptedOwnerId=x.assignment.state==="accepted"?x.assignment.ownerId??null:null;
 if(x.assignment.state==="accepted"&&!acceptedOwnerId)warnings.push("accepted ownership missing confirmed actor");
 if(pr.state==="merged"&&!pr.mergedSha)warnings.push("merged PR has no merged commit evidence");
 let verification:Reconciled["verification"]="no_check";
 if(x.checks.length){
   const matching=currentSha?x.checks.filter(c=>c.commitSha===currentSha):[];
   verification=!matching.length?"stale":matching.some(c=>c.conclusion==="failure")?"failed":matching.every(c=>c.conclusion==="success")?"check_passed_for_head":"pending";
 }
 if(verification==="stale")warnings.push("available CI result is for a different SHA");
 if(pr.state==="open")warnings.push("open pull request is not merged");
 return {taskId:x.id,ownerState:x.assignment.state,acceptedOwnerId,implementation:pr.state,verification,currentSha,productionVerified:false,warnings};
}
