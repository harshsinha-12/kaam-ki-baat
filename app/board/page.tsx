"use client";
import { useEffect, useState } from "react";
import { SpatialWorkspace } from "../components/SpatialWorkspace";
import { browserHandoff } from "@/lib/auth/browser-handoff";

// Three-card specialist board (left / center / right), Air Agents-style:
// the active specialist lights up; each card shows the evidence it returned.
// Visual metaphor only — the phone call itself is not spatial audio.

type Evidence = { id: string; label: string; url?: string; match?: "candidate" | "confirmed" };
type Card = { id: string; label: string; position: "left" | "center" | "right"; status: string; summary: string; evidence: Evidence[] };
type Board = {
  ok: boolean;
  error?: string;
  snapshot?: { label: string; repository: string; pinnedSha: string; fetchedAt: string };
  conversation: null | {
    callId: string;
    focus: { active: string; taskId: string | null; contextVersion: number };
    cards: Record<string, Card>;
    turns: { at: string; utterance: string; specialist: string; spoken: string }[];
    outstanding: { id: string; fact: string; attempts: number }[];
  };
};

const ORDER = ["code_scout", "fix_navigator", "evidence_verifier"];

export default function Home() {
  const [board, setBoard] = useState<Board | null>(null);
  useEffect(() => {
    const key = browserHandoff().boardKey;
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetch(`/api/board?key=${encodeURIComponent(key)}`, { cache: "no-store" });
        const j = (await r.json()) as Board;
        if (alive) setBoard(j);
      } catch { /* keep last state */ }
    };
    tick();
    const t = setInterval(tick, 1500);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const conv = board?.conversation;
  return (
    <main style={{ fontFamily: "ui-sans-serif, system-ui", background: "#0d0f12", color: "#e8e6e1", minHeight: "100vh", padding: "28px 32px" }}>
      <style>{`
        .specialists { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; margin-top: 28px; }
        .details { display: grid; grid-template-columns: 2fr 1fr; gap: 18px; margin-top: 24px; }
        .active-card { animation: focus-glow 2s ease-in-out infinite alternate; }
        @keyframes focus-glow { to { box-shadow: 0 10px 36px rgba(240,180,41,.3); } }
        @media (max-width: 760px) { .specialists, .details { grid-template-columns: 1fr; } }
        @media (prefers-reduced-motion: reduce) { .active-card { animation: none; } article { transition: none !important; transform: none !important; } }
      `}</style>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28 }}>Kaam Ki Baat</h1>
          <p style={{ margin: "4px 0 0", opacity: 0.7 }}>Meeting mein bola. Repo mein bana?</p>
        </div>
        {board?.snapshot && (
          <div style={{ fontSize: 13, textAlign: "right" }}>
            <span style={{ padding: "8px 14px", fontSize: 18, display: "inline-block", borderRadius: 6, background: board.snapshot.label === "LIVE" ? "#1f6f43" : "#8a5a00", fontWeight: 600 }}>{board.snapshot.label === "LIVE" ? "LIVE evidence" : "FIXTURE · demo data"}</span>{" "}
            {board.snapshot.repository} @ <code>{board.snapshot.pinnedSha.slice(0, 7)}</code>
            {conv && <div style={{ opacity: 0.7 }}>call {conv.callId} · task {conv.focus.taskId ?? "none"} · context v{conv.focus.contextVersion}</div>}
          </div>
        )}
      </header>

      <SpatialWorkspace />

      {!board?.ok && <p style={{ marginTop: 32, opacity: 0.8 }}>{board?.error === "unauthorized" ? "Open your prepared workspace link to connect." : "Loading…"}</p>}
      {board?.ok && !conv && <p style={{ marginTop: 32, opacity: 0.8 }}>Waiting for a call. The board lights up when Bolna calls get_my_brief.</p>}

      {conv && (
        <>
          <section className="specialists" aria-label="Evidence specialists">
            {ORDER.map((id) => {
              const c = conv.cards[id];
              const active = conv.focus.active === id;
              return (
                <article key={id} className={active ? "active-card" : undefined} aria-label={`${c.label}${active ? ", active" : ""}`} style={{
                  border: `1px solid ${active ? "#f0b429" : "#2a2f36"}`, borderRadius: 14, padding: 18, background: active ? "#1a1810" : "#14171b",
                  transform: active ? "translateY(-6px)" : "none", transition: "all .25s", boxShadow: active ? "0 10px 30px rgba(240,180,41,.15)" : "none",
                }}>
                  <div style={{ fontSize: 12, opacity: 0.6, textTransform: "uppercase", letterSpacing: 1 }}>{c.position}</div>
                  <h2 style={{ margin: "4px 0 6px", fontSize: 20 }}>{c.label}</h2>
                  <div style={{ fontSize: 12, marginBottom: 10, color: c.status === "error" ? "#ff6b6b" : active ? "#f0b429" : "#8b949e" }}>● {c.status.replace("_", " ")}</div>
                  <p style={{ fontSize: 14, lineHeight: 1.45, minHeight: 60 }}>{c.summary}</p>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: 13 }}>
                    {c.evidence.map((e) => (
                      <li key={e.id} style={{ padding: "6px 0", borderTop: "1px solid #2a2f36" }}>
                        {e.match && <span style={{ fontSize: 11, marginRight: 6, padding: "1px 6px", borderRadius: 4, background: e.match === "confirmed" ? "#1f6f43" : "#444" }}>{e.match}</span>}
                        {e.url ? <a href={e.url} target="_blank" rel="noreferrer" style={{ color: "#79c0ff" }}>{e.label}</a> : e.label}
                      </li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </section>
          <section className="details">
            <div style={{ background: "#14171b", borderRadius: 14, padding: 18 }}>
              <h3 style={{ marginTop: 0 }}>Tool timeline</h3>
              <p style={{ fontSize: 12, opacity: 0.7 }}>Successful get_task_evidence turns · latest six. Other tools are recorded in the private audit log.</p>
              {conv.turns.length === 0 && <p>No evidence tool turns yet.</p>}
              {conv.turns.slice(-6).map((t, i) => (
                <div key={i} style={{ fontSize: 14, marginBottom: 10 }}>
                  <div style={{ fontSize: 12, color: "#f0b429" }}><time dateTime={t.at}>{new Date(t.at).toLocaleTimeString()}</time> · get_task_evidence → {t.specialist.replaceAll("_", " ")}</div>
                  <div>{t.spoken}</div>
                </div>
              ))}
            </div>
            <div style={{ background: "#14171b", borderRadius: 14, padding: 18 }}>
              <h3 style={{ marginTop: 0 }}>Not yet acknowledged</h3>
              {conv.outstanding.length === 0 ? <p style={{ opacity: 0.7 }}>Everything was acknowledged.</p> :
                conv.outstanding.map((o) => <p key={o.id} style={{ fontSize: 14 }}>{o.fact} <span style={{ opacity: 0.6 }}>(said {o.attempts}×)</span></p>)}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
