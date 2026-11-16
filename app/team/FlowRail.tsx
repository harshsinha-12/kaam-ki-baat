"use client";
import type { CSSProperties, ReactNode } from "react";
import w from "./workspace.module.css";
import type { FlowStage } from "./flow-state";
import { BrandMark } from "../components/BrandMark";
import { AgentGlyph } from "../components/AgentGlyph";

// How a question travels, drawn live: you → Wispr → Kaam Ki Baat, which then
// either asks the lead (up) or opens the code (down). `stage` comes from what
// the workspace is doing right now, so the packet follows the user's own
// question instead of looping a canned animation.
type Step = { k: "voice" | "wispr" | "core" | "leader" | "code"; t: string; d: string; icon: ReactNode };
const MIC = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 10.5a6.5 6.5 0 0 0 13 0M12 17v4M8.5 21h7" /></svg>;
const STEPS: Step[] = [
  { k: "voice", t: "You ask", d: "Voice or text. Hinglish is fine.", icon: MIC },
  // eslint-disable-next-line @next/next/no-img-element
  { k: "wispr", t: "Wispr Flow", d: "Meeting notes, words cleaned up", icon: <img src="/brand/wispr-flow.png" alt="" /> },
  { k: "core", t: "Kaam Ki Baat", d: "Checks what was really decided", icon: <BrandMark size={30} /> },
  { k: "leader", t: "Leader Desk", d: "Asked only when it isn’t sure", icon: <AgentGlyph zone="leader_desk" size={30} /> },
  { k: "code", t: "Code Navigator", d: "File, function, line and test", icon: <AgentGlyph zone="code_navigator" size={30} /> },
];

function Node({ step, state, busy }: { step: Step; state: string; busy: boolean }) {
  const label = state === "done" ? "Done" : state === "now" ? (busy ? "Working" : step.k === "voice" ? "Ready" : "Done") : state === "skip" ? "Not needed" : "Waiting";
  return (
    <li className={w.jNode} data-step={step.k} data-state={state} data-busy={state === "now" && busy}>
      <span className={w.jIcon} data-kind={step.k}>{step.icon}</span>
      <span className={w.jText}><strong>{step.t}</strong><small>{step.d}</small></span>
      <span className={w.jState}>{label}</span>
    </li>
  );
}

export function FlowRail({ stage, busy, branch }: { stage: FlowStage; busy: boolean; branch: "leader" | "code" | null }) {
  const state = (i: number, k: Step["k"]) => {
    if ((branch === "code" && k === "leader") || (branch === "leader" && k === "code")) return "skip";
    if (branch === null && (k === "leader" || k === "code")) return "next";
    return i < stage ? "done" : i === stage ? "now" : "next";
  };
  // Which connector carries the packet right now.
  const live = busy ? (stage === 1 ? "a" : stage === 3 ? "up" : stage === 4 ? "down" : "b") : "";
  const lit = (seg: string) => (seg === "a" ? stage >= 1 : seg === "b" ? stage >= 2 : seg === "up" ? stage === 3 : stage === 4);
  return (
    <ol className={w.journey} aria-label="How your question travels" data-busy={busy}>
      <Node step={STEPS[0]} state={state(0, "voice")} busy={busy} />
      <li className={w.jLink} data-lit={lit("a")} data-live={live === "a"} aria-hidden><i /></li>
      <Node step={STEPS[1]} state={state(1, "wispr")} busy={busy} />
      <li className={w.jLink} data-lit={lit("b")} data-live={live === "b"} aria-hidden><i /></li>
      <Node step={STEPS[2]} state={state(2, "core")} busy={busy} />
      <li className={w.jFork} aria-hidden>
        <svg viewBox="0 0 60 100" preserveAspectRatio="none">
          <path d="M0 50 C30 50 30 24 60 24" data-lit={lit("up")} data-live={live === "up"} />
          <path d="M0 50 C30 50 30 76 60 76" data-lit={lit("down")} data-live={live === "down"} />
        </svg>
      </li>
      <li className={w.jBranch}>
        <ol style={{ "--n": 2 } as CSSProperties}>
          <Node step={STEPS[3]} state={state(3, "leader")} busy={busy} />
          <Node step={STEPS[4]} state={state(4, "code")} busy={busy} />
        </ol>
      </li>
    </ol>
  );
}
