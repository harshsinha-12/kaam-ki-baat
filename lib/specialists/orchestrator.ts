import type { CodeFinding, EvidenceSnapshot, Task } from "../contracts";
import { confirmHeard, markAttempted, newReport, outstandingFacts, type Report } from "../core/communication-ledger";
import type { SavedUpdate } from "../core/persist-update";
import { chooseSpecialist, SPECIALISTS, switchFocus, type CardStatus, type FocusState, type Specialist } from "../core/spatial-specialists";
import { codeScout } from "./code-scout";
import { evidenceVerifier } from "./evidence-verifier";
import { fixNavigator, type NavigationPlan } from "./fix-navigator";

// One voice persona, three specialists behind it. Shared state (taskId,
// contextVersion, evidence) survives every switch so the caller never repeats
// themselves. The communication ledger keeps unfinished facts across interruptions.

export interface Card {
  id: Specialist;
  label: string;
  position: "left" | "center" | "right";
  status: CardStatus;
  summary: string;
  evidence: Array<{ id: string; label: string; url?: string; match?: "candidate" | "confirmed" }>;
}

export interface Conversation {
  callId: string;
  participantId: string;
  focus: FocusState;
  cards: Record<Specialist, Card>;
  ledger: Report;
  findings: CodeFinding[]; // Code Scout's latest results, reused by Fix Navigator
  lastSpokenFactIds: string[];
  turns: Array<{ at: string; utterance: string; specialist: Specialist; spoken: string }>;
}

export function startConversation(callId: string, participantId: string, taskId: string | null, briefFacts: { id: string; fact: string }[]): Conversation {
  const cards = Object.fromEntries(
    (Object.keys(SPECIALISTS) as Specialist[]).map((id) => [
      id,
      { id, label: SPECIALISTS[id].label, position: SPECIALISTS[id].position, status: "idle" as CardStatus, summary: SPECIALISTS[id].purpose, evidence: [] },
    ]),
  ) as unknown as Record<Specialist, Card>;
  return {
    callId,
    participantId,
    focus: { active: "evidence_verifier", taskId, contextVersion: 1 },
    cards,
    ledger: newReport(callId, briefFacts),
    findings: [],
    lastSpokenFactIds: [],
    turns: [],
  };
}

const ACK = /\b(ok|okay|got it|understood|samajh gaya|samajh gayi|theek hai|thik hai|haan|yes|right|clear)\b/i;

export interface TurnResult {
  conversation: Conversation;
  specialist: Specialist;
  spoken: string;
  resumedFactIds: string[];
  navigation?: NavigationPlan;
}

export function handleTurn(
  conv: Conversation,
  snapshot: EvidenceSnapshot,
  task: Task | undefined,
  lastSaved: SavedUpdate | null,
  input: { utterance: string; focus?: Specialist },
): TurnResult {
  let c: Conversation = { ...conv, cards: { ...conv.cards } };

  // Acknowledgement of what we just said is the only proof it was heard.
  if (ACK.test(input.utterance)) {
    for (const id of c.lastSpokenFactIds) {
      try { c.ledger = confirmHeard(c.ledger, id); } catch { /* not attempted yet */ }
    }
  }

  const specialist = input.focus ?? chooseSpecialist(input.utterance, c.focus.active);
  c.focus = switchFocus(c.focus, specialist);
  for (const id of Object.keys(c.cards) as Specialist[]) {
    c.cards[id] = { ...c.cards[id], status: id === specialist ? "working" : c.cards[id].status === "working" ? "idle" : c.cards[id].status };
  }

  let spoken = "";
  let navigation: NavigationPlan | undefined;
  if (specialist === "code_scout") {
    const findings = codeScout(snapshot, task, input.utterance);
    c.findings = findings;
    spoken = findings.length
      ? `I found ${findings.length} place${findings.length > 1 ? "s" : ""}. The best match is ${findings[0].path}${findings[0].symbol ? `, in ${findings[0].symbol}` : ""} — ${findings[0].match === "confirmed" ? "it's changed in the PR" : "a possible match, not confirmed"}.`
      : "I didn't find a match at the pinned commit.";
    c.cards.code_scout = { ...c.cards.code_scout, status: "has_reply", summary: spoken, evidence: findings.map(cardEvidence) };
  } else if (specialist === "fix_navigator") {
    if (!c.findings.length) c.findings = codeScout(snapshot, task, input.utterance); // reuse context, don't make the caller repeat
    navigation = fixNavigator(snapshot, c.findings);
    spoken = navigation.spoken;
    c.cards.fix_navigator = {
      ...c.cards.fix_navigator,
      status: "has_reply",
      summary: navigation.steps.join(" "),
      evidence: [
        ...(navigation.target ? [cardEvidence(navigation.target)] : []),
        ...(navigation.test ? [{ id: `test:${navigation.test.path}`, label: `${navigation.test.path}:${navigation.test.line}`, url: navigation.test.url }] : []),
      ],
    };
    if (c.findings.length && !c.cards.code_scout.evidence.length) {
      c.cards.code_scout = { ...c.cards.code_scout, status: "has_reply", evidence: c.findings.map(cardEvidence) };
    }
  } else {
    if (!task) {
      spoken = "I don't have a task you're authorized for, so I can't verify anything.";
    } else {
      const v = evidenceVerifier(snapshot, task, lastSaved);
      spoken = v.statements.slice(0, 3).join(" ");
      c.cards.evidence_verifier = {
        ...c.cards.evidence_verifier,
        status: "has_reply",
        summary: v.statements.join(" "),
        evidence: [
          ...snapshot.pullRequests.filter((p) => p.number === task.prNumber).map((p) => ({ id: p.id, label: `PR #${p.number} · ${p.state} · ${p.headSha.slice(0, 7)}`, url: p.url })),
          ...snapshot.checks.filter((k) => k.commitSha === v.reconciled.currentSha || k.commitSha === v.reconciled.checkShaSeen).map((k) => ({ id: k.id, label: `${k.name}: ${k.conclusion} @ ${k.commitSha.slice(0, 7)}`, url: k.url })),
          ...(lastSaved ? [{ id: lastSaved.id, label: `saved: ${lastSaved.status}` }] : []),
        ],
      };
    }
  }

  // Interruption recovery: answer first, then return to ONE important unfinished fact.
  // Resume only facts that were never said (e.g. cut off by an interruption),
  // and skip any fact this answer already covers. Never nag with repeats.
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const pending = outstandingFacts(c.ledger).filter((f) => f.attempts === 0 && !norm(spoken).includes(norm(f.fact)));
  const resumed = pending.slice(0, 1);
  if (resumed.length) {
    spoken += ` Also, before I forget: ${resumed[0].fact}`;
    c.ledger = markAttempted(c.ledger, resumed[0].id);
  }
  c.lastSpokenFactIds = resumed.map((f) => f.id);
  c.turns = [...c.turns, { at: new Date().toISOString(), utterance: input.utterance, specialist, spoken }];
  return { conversation: c, specialist, spoken, resumedFactIds: resumed.map((f) => f.id), navigation };
}

const cardEvidence = (f: CodeFinding) => ({
  id: f.id,
  label: `${f.path}:${f.lineStart}${f.symbol ? ` (${f.symbol})` : ""} @ ${f.commitSha.slice(0, 7)}`,
  url: f.url,
  match: f.match,
});
