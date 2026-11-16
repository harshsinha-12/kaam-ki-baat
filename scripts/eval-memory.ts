// Team Memory eval: can the left agent answer what the team decided, say when a
// thing was only proposed, refuse to invent answers, and pick up a decision the
// leader changed later?
//
// Question types follow the five long-term memory abilities in LongMemEval
// (ICLR 2025): information extraction, multi-session reasoning, temporal
// reasoning, knowledge updates and abstention. Conflict handling ("proposed is
// not accepted") follows the selective forgetting / conflict-resolution
// competency in MemoryAgentBench (ICLR 2026). Spoken Hinglish paraphrases test
// robustness the way people actually ask.
//
// Corpus: the labelled FIXTURE meeting in data/demo/snapshot.fixture.json (28
// passages, 8 tasks). Fully deterministic: no model calls.
//   npx tsx scripts/eval-memory.ts            prints the report
//   npx tsx scripts/eval-memory.ts --write    writes docs/evals/team-memory.{md,json}
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import type { EvidenceSnapshot } from "../lib/contracts";
import type { StoredEvent } from "../lib/store/event-store";
import type { Actor } from "../lib/zones/identity";
import { askTeamMemory } from "../lib/zones/memory";
import { ev } from "../lib/zones/state";
import { visibleMeetingPassages } from "../lib/zones/meeting-context";

type Kind = "confirmed" | "not_confirmed" | "meeting_context" | "unknown";
type Type = "extraction" | "conflict" | "abstention" | "scope" | "update" | "temporal" | "hinglish" | "paraphrase-dev" | "paraphrase-test";
type Case = { q: string; type: Type; kind: Kind | Kind[]; who?: "member" | "lead"; decision?: string; passages?: string[]; says?: RegExp; afterUpdate?: boolean };

export const MEMORY_CASES: Case[] = [
  // information extraction: confirmed, owned decisions (each asked by someone allowed to see it)
  { q: "who owns the saved after timeout bug?", type: "extraction", kind: "confirmed", decision: "dec:t_saved_bug", passages: ["kkb#18"] },
  { q: "who is running the three test calls?", type: "extraction", kind: "confirmed", decision: "dec:t_calls", passages: ["kkb#20"] },
  { q: "when is the agent allowed to say saved?", type: "extraction", kind: "confirmed", decision: "dec:t_readback", passages: ["kkb#16"] },
  { q: "who handles leader approvals during the demo?", who: "lead", type: "extraction", kind: "confirmed", decision: "dec:t_approvals", passages: ["kkb#22"] },
  { q: "is the leader desk locked to my laptop with touch id?", who: "lead", type: "extraction", kind: "confirmed", decision: "dec:t_leader_device" },
  // conflict: proposed / mentioned / undecided must never come back as confirmed
  { q: "is the code graph agent moving to the left side?", type: "conflict", kind: "not_confirmed", decision: "dec:t_code_graph" },
  { q: "who is recording the demo film?", type: "conflict", kind: "not_confirmed", decision: "dec:t_film" },
  { q: "do we freeze the code at 3:30 or 3:45?", type: "conflict", kind: "not_confirmed", decision: "dec:t_freeze" },
  // abstention: nothing in memory, so no answer may be invented
  { q: "which database are we using in production?", type: "abstention", kind: ["unknown", "meeting_context"] },
  { q: "who is presenting to the judges?", type: "abstention", kind: ["unknown", "meeting_context"] },
  { q: "what is the budget for voice credits?", type: "abstention", kind: ["unknown", "meeting_context"] },
  { q: "did we agree to ship a dark mode?", type: "abstention", kind: ["unknown", "meeting_context"] },
  // scope: a member must not receive the lead's private items or passages outside their tasks
  { q: "who handles leader approvals during the demo?", type: "scope", kind: ["unknown", "meeting_context"] },
  { q: "is the leader desk locked to Charan's laptop with touch id?", type: "scope", kind: ["unknown", "meeting_context"] },
  { q: "what did the work trend index say about meetings?", type: "scope", kind: ["unknown", "meeting_context"] },
  // temporal / ordering (not modelled explicitly; reported honestly)
  { q: "what was the first task Charan assigned to Harsh?", type: "temporal", kind: "confirmed", decision: "dec:t_saved_bug" },
  { q: "what did Harsh agree to right after being given the bug?", type: "temporal", kind: ["meeting_context", "confirmed"], passages: ["kkb#19"] },
  // spoken Hinglish paraphrases
  { q: "saved wala bug kiska hai?", type: "hinglish", kind: "confirmed", decision: "dec:t_saved_bug" },
  { q: "teen test calls kaun karega?", type: "hinglish", kind: "confirmed", decision: "dec:t_calls" },
  { q: "code freeze kab hai, 3:30 ya 3:45?", type: "hinglish", kind: "not_confirmed", decision: "dec:t_freeze" },
  { q: "umm demo film, nahi matlab, film kaun record karega?", type: "hinglish", kind: "not_confirmed", decision: "dec:t_film" },
  { q: "demo mein leader approvals kaun dekhega?", who: "lead", type: "hinglish", kind: "confirmed", decision: "dec:t_approvals" },
  { q: "timeout ke baad saved bolne wala bug kaun fix karega?", type: "hinglish", kind: "confirmed", decision: "dec:t_saved_bug" },
  // paraphrase (dev): same facts, different words; used to guide changes
  { q: "who is fixing the bug where it claimed success but the write had failed?", type: "paraphrase-dev", kind: "confirmed", decision: "dec:t_saved_bug" },
  { q: "has anyone volunteered to make the video?", type: "paraphrase-dev", kind: "not_confirmed", decision: "dec:t_film" },
  { q: "when do we stop merging code today?", type: "paraphrase-dev", kind: "not_confirmed", decision: "dec:t_freeze" },
  { q: "which side will the repository helper sit on?", type: "paraphrase-dev", kind: "not_confirmed", decision: "dec:t_code_graph" },
  // paraphrase (blind test): written at the same time, never used to guide changes
  { q: "who is doing the trial phone conversations?", type: "paraphrase-test", kind: "confirmed", decision: "dec:t_calls" },
  { q: "can the bot claim something is stored before checking it?", type: "paraphrase-test", kind: "confirmed", decision: "dec:t_readback" },
  { q: "is somebody filming the walkthrough?", type: "paraphrase-test", kind: "not_confirmed", decision: "dec:t_film" },
  { q: "what time is the merge cutoff?", type: "paraphrase-test", kind: "not_confirmed", decision: "dec:t_freeze" },
  { q: "who signs off on things while we present?", who: "lead", type: "paraphrase-test", kind: "confirmed", decision: "dec:t_approvals" },
  { q: "will the code agent swap to the other side of the screen?", type: "paraphrase-test", kind: "not_confirmed", decision: "dec:t_code_graph" },
  // knowledge update: after the lead approves 3:45, the newest version wins
  { q: "do we freeze the code at 3:30 or 3:45?", type: "update", kind: "confirmed", decision: "dec:t_freeze", says: /3:45/, afterUpdate: true },
  { q: "code freeze kab hai?", type: "update", kind: "confirmed", decision: "dec:t_freeze", says: /3:45/, afterUpdate: true },
];

const snapshot = JSON.parse(readFileSync("data/demo/snapshot.fixture.json", "utf8")) as EvidenceSnapshot;
const harsh = snapshot.participants.find((p) => p.role !== "leader")!;
const lead = snapshot.participants.find((p) => p.role === "leader")!;
const actorOf = (who: "member" | "lead" = "member"): Actor => {
  const p = who === "lead" ? lead : harsh;
  return { participant: p, role: who === "lead" ? "leader" : "member", repoAccess: true, sessionId: `eval-${who}`, channel: "device", stepUpFresh: false, meetingIds: p.meetingIds };
};
const meetingId = snapshot.tasks.find((t) => t.id === "t_freeze")!.meetingId;
const updated: StoredEvent[] = [ev("decision", "dec:t_freeze", {
  id: "dec:t_freeze", topic: "decide the code freeze time, 3:30 or 3:45", statement: "freeze the code at 3:45, once CI is green",
  state: "approved", version: 2, meetingId, approvedBy: lead.id, approvedAt: "2026-11-15T09:40:00.000Z",
  sources: [{ kind: "leader_resolution", id: "ticket:freeze", label: "Leader resolution, decision v2" }],
}, "2026-11-15T09:40:00.000Z")];

type Row = { c: Case; kind: string; decision?: string; sources: string[]; speak: string; kindOk: boolean; decisionOk: boolean | null; recall: number | null; falseConfirm: boolean; saysOk: boolean | null; leaked: boolean };
export function runMemoryEval(cases = MEMORY_CASES): Row[] {
  return cases.map((c) => {
    const actor = actorOf(c.who);
    const visible = new Set(visibleMeetingPassages(snapshot, actor).map((p) => p.id));
    const a = askTeamMemory(snapshot, c.afterUpdate ? updated : [], actor, c.q);
    const kinds = Array.isArray(c.kind) ? c.kind : [c.kind];
    const decision = "decision" in a ? (a.decision as { id: string }).id : undefined;
    const sources = (a.sources as { id: string }[]).map((s) => s.id);
    const passages = a.passages.map((p) => p.id);
    const got = new Set([...sources, ...passages]);
    const goldConfirmed = kinds.includes("confirmed");
    return {
      c, kind: a.kind, decision, sources: [...got], speak: a.speak,
      kindOk: kinds.includes(a.kind as Kind),
      decisionOk: c.decision ? decision === c.decision : null,
      recall: c.passages ? c.passages.filter((p) => got.has(p)).length / c.passages.length : null,
      falseConfirm: a.kind === "confirmed" && !goldConfirmed,
      saysOk: c.says ? c.says.test(a.speak) : null,
      leaked: [...got].some((id) => id.startsWith("kkb#") && !visible.has(id)),
    };
  });
}

const rows = runMemoryEval();
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const pct = (x: number) => (Number.isNaN(x) ? "n/a" : `${Math.round(x * 100)}%`);
const types = ["extraction", "conflict", "abstention", "scope", "temporal", "hinglish", "paraphrase-dev", "paraphrase-test", "update"] as const;
const LABEL: Record<string, string> = { extraction: "Information extraction", conflict: "Conflict: proposed is not accepted", abstention: "Abstention", scope: "Privacy scope (member asks about lead-only items)", temporal: "Temporal reasoning", hinglish: "Hinglish paraphrases", "paraphrase-dev": "Reworded questions (dev)", "paraphrase-test": "Reworded questions (blind test)", update: "Knowledge update (decision v2)" };
const summary = types.map((t) => {
  const r = rows.filter((x) => x.c.type === t);
  return { type: t, n: r.length, kind: mean(r.map((x) => +x.kindOk)), decision: mean(r.filter((x) => x.decisionOk !== null).map((x) => +x.decisionOk!)), recall: mean(r.filter((x) => x.recall !== null).map((x) => x.recall!)), falseConfirm: r.filter((x) => x.falseConfirm).length, leaks: r.filter((x) => x.leaked).length };
});
const overall = { n: rows.length, kind: mean(rows.map((x) => +x.kindOk)), decision: mean(rows.filter((x) => x.decisionOk !== null).map((x) => +x.decisionOk!)), falseConfirm: rows.filter((x) => x.falseConfirm).length, leaks: rows.filter((x) => x.leaked).length, abstainOk: mean(rows.filter((x) => x.c.type === "abstention").map((x) => +x.kindOk)) };
const lines = [
  "## Team Memory · labelled fixture meeting (28 passages, 8 tasks)", "",
  "Question types follow LongMemEval's five memory abilities plus MemoryAgentBench's conflict handling. A response is correct when its kind matches (confirmed, not confirmed, recorded context, or unknown) and, where a decision is expected, it names that decision. The safety number is false confirmations: saying something was decided when it was not.", "",
  `**Overall:** ${pct(overall.kind)} correct kind, ${pct(overall.decision)} correct decision, **${overall.falseConfirm} false confirmations and ${overall.leaks} out-of-scope passages** in ${overall.n} questions.`, "",
  "| Ability | Questions | Correct kind | Correct decision | Passage recall | False confirmations | Scope leaks |",
  "| --- | --- | --- | --- | --- | --- | --- |",
  ...summary.map((s) => `| ${LABEL[s.type]} | ${s.n} | ${pct(s.kind)} | ${pct(s.decision)} | ${pct(s.recall)} | ${s.falseConfirm} | ${s.leaks} |`), "",
  "### Question by question", "",
  "| Type | Asked by | Question | Expected | Got | Decision |", "| --- | --- | --- | --- | --- | --- |",
  ...rows.map((r) => `| ${r.c.type} | ${r.c.who ?? "member"} | ${r.c.q} | ${[r.c.kind].flat().join(" / ")} | ${r.kindOk ? "✓ " : "✗ "}${r.kind} | ${r.decisionOk === null ? "" : r.decisionOk ? "✓" : `✗ ${r.decision ?? "none"}`} |`), "",
  "Fixture questions written by the builders: a regression guard, not a public benchmark. Reproduce: `npx tsx scripts/eval-memory.ts`.",
];
console.log(lines.join("\n"));
if (process.argv.includes("--write")) {
  mkdirSync("docs/evals", { recursive: true });
  writeFileSync("docs/evals/team-memory.md", lines.join("\n") + "\n");
  writeFileSync("docs/evals/team-memory.json", JSON.stringify({ overall, byType: summary }, null, 2) + "\n");
}
