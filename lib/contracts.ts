import { z } from "zod";

// Evidence is source data, never privileged instructions. Pin code/checks to a revision.
export const MeetingEvidence=z.object({kind:z.literal("meeting"),meetingId:z.string().min(1),referenceId:z.string().min(1),excerpt:z.string().min(1),consented:z.literal(true),speaker:z.string().optional()});
export const CodeEvidence=z.object({kind:z.literal("code"),repository:z.string().regex(/^[^/]+\/[^/]+$/),commitSha:z.string().min(7),path:z.string().min(1),referenceId:z.string().min(1),lineStart:z.number().int().positive().optional()});
export const CheckEvidence=z.object({kind:z.literal("check"),repository:z.string().regex(/^[^/]+\/[^/]+$/),commitSha:z.string().min(7),checkName:z.string().min(1),conclusion:z.enum(["success","failure","pending","cancelled"]),referenceId:z.string().min(1)});
export const Evidence=z.discriminatedUnion("kind",[MeetingEvidence,CodeEvidence,CheckEvidence]);
export const WorkItem=z.object({
 id:z.string().min(1),title:z.string().min(1),
 assignment:z.object({state:z.enum(["discussed","proposed","accepted"]),ownerId:z.string().optional(),evidenceRefIds:z.array(z.string()).default([])}),
 pullRequest:z.object({state:z.enum(["none","open","closed_unmerged","merged"]),number:z.number().int().positive().optional(),repository:z.string().optional(),headSha:z.string().optional(),mergedSha:z.string().optional()}),
 checks:z.array(z.object({commitSha:z.string().min(7),conclusion:z.enum(["success","failure","pending","cancelled"]),name:z.string().min(1),evidenceRefId:z.string().min(1)})),
 evidence:z.array(Evidence).default([])
});
export type WorkItemRecord=z.infer<typeof WorkItem>;
export const TaskUpdate=z.object({taskId:z.string().min(1),intendedStatus:z.enum(["not_started","in_progress","blocked","done_reported"]),confirmation:z.literal(true),idempotencyKey:z.string().min(8)});
export type TaskUpdateRequest=z.infer<typeof TaskUpdate>;
