import {TaskUpdate,type TaskUpdateRequest} from "../contracts";
// Caller identity is trusted only when supplied by server authentication, never from LLM arguments.
export type SavedUpdate={id:string;taskId:string;actorId:string;status:TaskUpdateRequest["intendedStatus"];idempotencyKey:string};
export interface UpdateRepository{
 writeOnce(record:SavedUpdate):Promise<{id:string}>;read(id:string):Promise<SavedUpdate|null>;
}
export async function persistVerifiedUpdate(args:{raw:TaskUpdateRequest;trustedActorId:string|null;authorizedTaskIds:ReadonlySet<string>;repository:UpdateRepository;generateId:()=>string}):Promise<{saved:boolean;recordId?:string;reason?:string}>{
 const parsed=TaskUpdate.safeParse(args.raw);
 if(!parsed.success)return {saved:false,reason:"invalid or unconfirmed update"};
 if(!args.trustedActorId||!args.authorizedTaskIds.has(parsed.data.taskId))return {saved:false,reason:"unauthorized"};
 const candidate:SavedUpdate={id:args.generateId(),taskId:parsed.data.taskId,actorId:args.trustedActorId,status:parsed.data.intendedStatus,idempotencyKey:parsed.data.idempotencyKey};
 try{
   const written=await args.repository.writeOnce(candidate);
   const actual=await args.repository.read(written.id);
   if(!actual||actual.taskId!==candidate.taskId||actual.actorId!==candidate.actorId||actual.status!==candidate.status||actual.idempotencyKey!==candidate.idempotencyKey)return {saved:false,reason:"read-back failed"};
   return {saved:true,recordId:actual.id};
 }catch{return {saved:false,reason:"write failed or timed out"}}
}
