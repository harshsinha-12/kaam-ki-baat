"use client";
import type { CSSProperties } from "react";
import s from "../zones/zones.module.css";
import type { FlowStage } from "./flow-state";

// How a question travels, drawn live: voice → Wispr → Kaam Ki Baat → (Leader | Code).
// `stage` is derived from what the workspace is doing right now, so the pulse
// follows the user's own question instead of looping a canned animation.
const STEPS = [
  { k: "voice", t: "You ask", d: "voice or text, Hinglish is fine" },
  { k: "wispr", t: "Wispr Flow", d: "meeting heard, words cleaned up" },
  { k: "core", t: "Kaam Ki Baat", d: "checks what was really decided" },
  { k: "leader", t: "Leader Desk", d: "asked only when it isn't sure" },
  { k: "code", t: "Code Navigator", d: "file, function, line, test" },
];

export function FlowRail({ stage, busy, branch }: { stage: FlowStage; busy: boolean; branch: "leader" | "code" | null }) {
  return (
    <ol className={s.flow} aria-label="How your question travels" data-busy={busy}>
      {STEPS.map((step, i) => {
        const dimmedBranch = (branch === "code" && step.k === "leader") || (branch === "leader" && step.k === "code");
        const state = dimmedBranch ? "skip" : i < stage ? "done" : i === stage ? "now" : "next";
        return (
          <li key={step.k} className={s.flowStep} data-step={step.k} data-state={state} style={{ "--i": i } as CSSProperties}>
            <span className={s.flowDot} aria-hidden="true" />
            <strong>{step.t}</strong>
            <small>{step.d}</small>
          </li>
        );
      })}
      <span className={s.flowTrack} aria-hidden="true"><span className={s.flowFill} style={{ width: `${(Math.min(stage, 4) / 4) * 100}%` }} /><span className={s.flowPulse} /></span>
    </ol>
  );
}
