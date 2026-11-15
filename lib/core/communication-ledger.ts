// Attempted speech is NOT proof that the listener heard it.
export type ReportItem={id:string;fact:string;attempts:number;acknowledged:boolean};
export type Report={callId:string;items:ReportItem[];interrupted:boolean};
export function newReport(callId:string,facts:{id:string;fact:string}[]):Report{
 if(new Set(facts.map(f=>f.id)).size!==facts.length)throw new Error("duplicate fact");
 return {callId,items:facts.map(f=>({...f,attempts:0,acknowledged:false})),interrupted:false};
}
export function markAttempted(r:Report,id:string):Report{
 if(!r.items.some(i=>i.id===id))throw new Error("unknown fact");
 return {...r,items:r.items.map(i=>i.id===id?{...i,attempts:i.attempts+1}:i)};
}
export function confirmHeard(r:Report,id:string):Report{
 if(!r.items.some(i=>i.id===id&&i.attempts>0))throw new Error("cannot confirm unattempted fact");
 return {...r,items:r.items.map(i=>i.id===id?{...i,acknowledged:true}:i)};
}
export function markInterrupted(r:Report):Report{return {...r,interrupted:true}}
export function outstandingFacts(r:Report):ReportItem[]{return r.items.filter(i=>!i.acknowledged)}
