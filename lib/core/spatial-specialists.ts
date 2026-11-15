// Air Agents-inspired focus switching; NOT actual head-tracked spatial audio.
export type Specialist="code_scout"|"fix_navigator"|"evidence_verifier";
export type FocusState={active:Specialist;taskId:string|null;contextVersion:number};
export const SPECIALISTS:Record<Specialist,{label:string;purpose:string;readOnly:true}>={
 code_scout:{label:"Code Scout",purpose:"Search selected repo, issues, PRs, and code evidence",readOnly:true},
 fix_navigator:{label:"Fix Navigator",purpose:"Explain exact file, function, and regression test to inspect",readOnly:true},
 evidence_verifier:{label:"Evidence Verifier",purpose:"Check SHA freshness, source permissions and completion status",readOnly:true}
};
export function chooseSpecialist(utterance:string,current:Specialist="code_scout"):Specialist{
 const s=utterance.toLowerCase();
 if(/\b(where|which file|how do i fix|show me the code|which function|line number|kahan|kis file)\b/.test(s))return "fix_navigator";
 if(/\b(proof|evidence|verified|test pass|ci|is it done|merged|source|really finished)\b/.test(s))return "evidence_verifier";
 if(/\b(find|what changed|what is left|pull request|issue|search|what happened)\b/.test(s))return "code_scout";
 return current;
}
export function switchFocus(state:FocusState,next:Specialist):FocusState{return {...state,active:next}}
