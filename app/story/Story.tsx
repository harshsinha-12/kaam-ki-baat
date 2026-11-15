"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import storyData from "../../data/demo/repo-story.json";
import { clock, traceTrail, type RepoStory, type StoryPR, type Trail } from "../../lib/story/trail";

// "How this codebase grew": every merged PR on main as a stop on one line,
// with a lane for each part of the product it shaped. Plain words, not code:
// pick a part (or ask a question) and the trail lights up from where it started
// to the latest change — the same sentences the voice agent reads out.

const S = storyData as unknown as RepoStory;
const REPO = `https://github.com/${S.repository}`;
const BG = "#000";
const PANEL = "#0a0a0a";
const LINE = "#1d1d1b";
const INK = "#f2efe6";
const MUTED = "#8a877e";
const DIM = "#4a4843";

// SVG layout (viewBox units)
const W = 1600, LEFT = 230, RIGHT = 40, TRUNK_Y = 92, LANE_Y0 = 170, LANE_GAP = 58;
const N = S.prs.length;
const GAP = (W - LEFT - RIGHT) / N;
const xOf = (i: number) => LEFT + GAP * (i + 0.5); // i = index of PR
const laneY = (k: number) => LANE_Y0 + k * LANE_GAP;
const H = laneY(S.areas.length - 1) + 60;
const AREA_INDEX = new Map(S.areas.map((a, k) => [a.id, k]));
const AREA = new Map(S.areas.map((a) => [a.id, a]));
const PR_INDEX = new Map(S.prs.map((p, i) => [p.number, i]));

const SUGGESTIONS = [
  "Code freeze kab hai — who decided?",
  "Where is a decision saved in the code?",
  "Why doesn't my head turn pick the agent?",
  "Who approves when the leader wasn't clear?",
  "What changed in the voice calls?",
];

export function Story() {
  const [selectedPR, setSelectedPR] = useState<StoryPR | null>(null);
  const [area, setArea] = useState<string | null>(null);
  const [trail, setTrail] = useState<Trail | null>(null);
  const [q, setQ] = useState("");
  const [step, setStep] = useState(-1); // walking a trail sentence by sentence
  const [chapter, setChapter] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const authors = useMemo(() => [...new Set(S.prs.flatMap((p) => p.authors))], []);
  const lit = useMemo(() => {
    if (trail) return new Set(trail.prs.map((p) => p.number));
    if (area) return new Set(S.prs.filter((p) => p.areas.includes(area)).map((p) => p.number));
    if (chapter) return new Set(S.prs.filter((p) => p.chapter === chapter).map((p) => p.number));
    return null;
  }, [trail, area, chapter]);
  const focusArea = trail?.areas[0]?.id ?? area;
  const activePR = trail && trail.prs.length && step >= trail.lead ? trail.prs[Math.min(step - trail.lead, trail.prs.length - 1)] : selectedPR;

  const stop = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  useEffect(() => stop, []);

  const ask = useCallback((text: string) => {
    stop(); setChapter(null); setSelectedPR(null);
    const t = traceTrail(S, text);
    setTrail(t); setArea(t.areas[0]?.id ?? null); setStep(-1); setQ(text);
  }, []);

  const walk = useCallback(() => {
    if (!trail) return;
    stop();
    let i = 0;
    const next = () => { setStep(i); i++; if (i < trail.sentences.length) timer.current = setTimeout(next, 3200); };
    next();
  }, [trail]);

  const playStory = useCallback(() => {
    stop(); setTrail(null); setArea(null); setSelectedPR(null); setStep(-1);
    let i = 0;
    const next = () => {
      if (i >= S.chapters.length) { setChapter(null); return; }
      setChapter(S.chapters[i].id); i++; timer.current = setTimeout(next, 3400);
    };
    next();
  }, []);

  const pickArea = (id: string) => { stop(); setChapter(null); setStep(-1); setSelectedPR(null); const a = AREA.get(id)!; setQ(""); setTrail(traceTrail(S, a.label)); setArea(id); };
  const reset = () => { stop(); setTrail(null); setArea(null); setSelectedPR(null); setChapter(null); setStep(-1); setQ(""); };

  // chapter bands
  const bands = S.chapters.map((c) => {
    const idx = S.prs.map((p, i) => (p.chapter === c.id ? i : -1)).filter((i) => i >= 0);
    return { c, x0: xOf(Math.min(...idx)) - GAP / 2, x1: xOf(Math.max(...idx)) + GAP / 2 };
  });

  // trail path along the focus lane
  const trailPts = trail && focusArea ? trail.prs.filter((p) => p.areas.includes(focusArea)).map((p) => [xOf(PR_INDEX.get(p.number)!), laneY(AREA_INDEX.get(focusArea)!)] as const) : [];
  const trailD = trailPts.map(([x, y], i) => `${i ? "L" : "M"}${x},${y}`).join(" ");
  const caption = chapter ? S.chapters.find((c) => c.id === chapter)!.plain : null;

  const btn: CSSProperties = { padding: "9px 14px", borderRadius: 999, border: `1px solid ${LINE}`, background: PANEL, color: INK, cursor: "pointer", fontSize: 13, fontFamily: "inherit" };

  return (
    <div style={{ minHeight: "100vh", background: BG, color: INK, fontFamily: "var(--font-sans), Inter, system-ui, sans-serif" }}>
      <style>{`
        @keyframes kkbRise { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }
        @keyframes kkbDraw { from { stroke-dashoffset: 1600 } to { stroke-dashoffset: 0 } }
        @keyframes kkbPulse { 0%,100% { r: 9 } 50% { r: 13 } }
        .kkb-col { animation: kkbRise .6s cubic-bezier(.2,.7,.2,1) both; animation-delay: calc(var(--i) * 45ms) }
        .kkb-trunk { stroke-dasharray: 1600; animation: kkbDraw 1.6s cubic-bezier(.2,.7,.2,1) both }
        .kkb-trail { stroke-dasharray: 1600; animation: kkbDraw 1.4s cubic-bezier(.2,.7,.2,1) both }
        .kkb-pulse { animation: kkbPulse 1.4s ease-in-out infinite }
        .kkb-chip:hover { border-color: #3a3832 !important }
        @media (prefers-reduced-motion: reduce) { .kkb-col, .kkb-trunk, .kkb-trail, .kkb-pulse { animation: none } }
      `}</style>

      {/* header */}
      <header style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px clamp(16px, 3vw, 36px)", borderBottom: `1px solid ${LINE}` }}>
        <a href="/" style={{ color: INK, textDecoration: "none", fontWeight: 650 }}>काम की बात</a>
        <span style={{ color: DIM }}>/</span>
        <span style={{ color: MUTED, fontSize: 14 }}>How this codebase grew</span>
        <nav style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <a href="/graph" style={{ ...btn, textDecoration: "none" }}>Code graph →</a>
          <a href={REPO} target="_blank" rel="noreferrer" style={{ ...btn, textDecoration: "none" }}>GitHub ↗</a>
        </nav>
      </header>

      <main style={{ padding: "28px clamp(16px, 3vw, 36px) 40px", maxWidth: 1680, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 24, alignItems: "end" }}>
          <div>
            <div style={{ fontSize: 12, letterSpacing: ".14em", textTransform: "uppercase", color: MUTED }}>The repository, as a story</div>
            <h1 style={{ fontFamily: "var(--font-serif), Georgia, serif", fontWeight: 400, fontSize: "clamp(34px, 4.4vw, 58px)", lineHeight: 1.05, margin: "10px 0 12px" }}>
              From one commit to <em>{N} pull requests</em> in an afternoon.
            </h1>
            <p style={{ color: MUTED, maxWidth: 760, margin: 0, lineHeight: 1.55 }}>
              Each dot on the line is a pull request merged into main. The lanes below show which part of the product it changed.
              Ask where something comes from, and the trail lights up from where it started to the latest change — the same answer the voice agent gives.
            </p>
          </div>
          <dl style={{ display: "grid", gridTemplateColumns: "repeat(4, auto)", gap: "4px 28px", margin: 0 }}>
            {[[`${S.totalCommits}`, "commits"], [`${N}`, "pull requests"], [`${authors.length}`, "builders"], [`${clock(S.firstCommit.at)} → ${clock(S.prs[N - 1].mergedAt)}`, "first commit → latest merge"]].map(([v, l]) => (
              <div key={l}><dt style={{ fontSize: 22, fontWeight: 600 }}>{v}</dt><dd style={{ margin: 0, color: MUTED, fontSize: 12 }}>{l}</dd></div>
            ))}
          </dl>
        </div>

        {/* ask */}
        <form onSubmit={(e) => { e.preventDefault(); if (q.trim()) ask(q.trim()); }} style={{ display: "flex", gap: 8, marginTop: 26, flexWrap: "wrap" }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask where something comes from — e.g. “who approves when the leader wasn't clear?”" aria-label="Ask where something comes from"
            style={{ flex: "1 1 420px", padding: "12px 16px", borderRadius: 999, border: `1px solid ${LINE}`, background: PANEL, color: INK, fontSize: 14 }} />
          <button type="submit" style={{ ...btn, background: INK, color: BG, border: 0, fontWeight: 650 }}>Trace it</button>
          <button type="button" onClick={playStory} style={btn}>▶ Play the story</button>
          {(trail || area || chapter || selectedPR) && <button type="button" onClick={reset} style={btn}>Reset</button>}
        </form>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          {SUGGESTIONS.map((s) => <button key={s} className="kkb-chip" onClick={() => ask(s)} style={{ ...btn, fontSize: 12.5, color: MUTED, padding: "6px 12px" }}>{s}</button>)}
        </div>

        {/* the map */}
        <div style={{ marginTop: 22, border: `1px solid ${LINE}`, borderRadius: 22, background: BG, overflowX: "auto" }}>
          <svg viewBox={`0 0 ${W} ${H}`} style={{ display: "block", width: "100%", minWidth: 980, height: "auto" }} role="img" aria-label={`Timeline of ${N} pull requests merged into ${S.repository}, by product area`}>
            {/* chapter bands */}
            {bands.map(({ c, x0, x1 }, i) => {
              const on = chapter === c.id;
              return (
                <g key={c.id} style={{ cursor: "pointer" }} onClick={() => { stop(); setTrail(null); setArea(null); setStep(-1); setChapter(on ? null : c.id); }}>
                  <rect x={x0 + 2} y={14} width={x1 - x0 - 4} height={30} rx={8} fill={on ? "#1a1914" : i % 2 ? "#070707" : "#0c0c0b"} stroke={on ? "#3a3832" : "none"} />
                  <text x={(x0 + x1) / 2} y={34} textAnchor="middle" fontSize={x1 - x0 < 180 ? 10.5 : 12.5} fill={on ? INK : MUTED}>{c.title}</text>
                  <rect x={x0 + 2} y={56} width={x1 - x0 - 4} height={H - 70} fill={on ? "rgba(245,196,81,.035)" : "transparent"} />
                </g>
              );
            })}

            {/* lanes */}
            {S.areas.map((a, k) => {
              const on = focusArea === a.id, faded = focusArea && !on;
              return (
                <g key={a.id} style={{ cursor: "pointer" }} onClick={() => pickArea(a.id)} opacity={faded ? 0.35 : 1}>
                  <rect x={0} y={laneY(k) - LANE_GAP / 2} width={W} height={LANE_GAP} fill="transparent" />
                  <line x1={LEFT - 10} x2={W - RIGHT} y1={laneY(k)} y2={laneY(k)} stroke={a.color} strokeOpacity={on ? 0.5 : 0.13} strokeWidth={on ? 2 : 1} />
                  <circle cx={22} cy={laneY(k)} r={5} fill={a.color} />
                  <text x={36} y={laneY(k) + 5} fontSize={15} fill={on ? INK : "#cfcabe"} fontWeight={on ? 650 : 450}>{a.label}</text>
                </g>
              );
            })}

            {/* trunk = main */}
            <line className="kkb-trunk" x1={LEFT - 30} x2={W - RIGHT + 10} y1={TRUNK_Y} y2={TRUNK_Y} stroke="#e9e4d6" strokeOpacity={0.55} strokeWidth={2} />
            <circle cx={LEFT - 30} cy={TRUNK_Y} r={6} fill={INK} />
            <text x={22} y={TRUNK_Y - 6} fontSize={13} fill={INK} fontWeight={650}>main</text>
            <text x={22} y={TRUNK_Y + 12} fontSize={11.5} fill={MUTED}>{clock(S.firstCommit.at)} · “{S.firstCommit.subject}”</text>

            {/* PR columns */}
            {S.prs.map((p, i) => {
              const x = xOf(i), isLit = !lit || lit.has(p.number), isActive = activePR?.number === p.number;
              const ks = p.areas.map((a) => AREA_INDEX.get(a) ?? 0);
              const deepest = ks.length ? Math.max(...ks) : -1;
              return (
                <g key={p.number} style={{ cursor: "pointer", transition: "opacity .45s" }} opacity={isLit ? 1 : 0.13}
                  onClick={() => { stop(); setStep(-1); setSelectedPR(p); }}>
                <g className="kkb-col" style={{ "--i": i } as CSSProperties}>
                  <rect x={x - GAP / 2} y={56} width={GAP} height={H - 70} fill="transparent" />
                  <line x1={x} x2={x} y1={TRUNK_Y} y2={deepest < 0 ? TRUNK_Y : laneY(deepest)} stroke={isActive ? INK : "#2a2925"} strokeWidth={isActive ? 1.6 : 1} strokeDasharray={isActive ? undefined : "2 4"} />
                  {p.areas.map((a) => { const k = AREA_INDEX.get(a) ?? 0; const color = AREA.get(a)?.color ?? INK;
                    return <circle key={a} cx={x} cy={laneY(k)} r={isActive ? 8 : 6} fill={color} stroke={BG} strokeWidth={2} />; })}
                  <circle cx={x} cy={TRUNK_Y} r={isActive ? 10 : 7} fill={isActive ? INK : BG} stroke={INK} strokeWidth={2} className={isActive ? "kkb-pulse" : undefined} />
                  <text x={x} y={TRUNK_Y - 18} textAnchor="middle" fontSize={11.5} fill={isActive ? INK : MUTED} fontWeight={isActive ? 700 : 500}>#{p.number}</text>
                  {(i % 3 === 0 || isActive) && <text x={x} y={H - 18} textAnchor="middle" fontSize={10.5} fill={DIM}>{clock(p.mergedAt)}</text>}
                </g>
                </g>
              );
            })}

            {/* trail along the focus lane */}
            {trailD && <path key={trailD} className="kkb-trail" d={trailD} fill="none" stroke={AREA.get(focusArea!)?.color} strokeWidth={3} strokeLinejoin="round" pointerEvents="none" style={{ filter: "drop-shadow(0 0 6px rgba(255,255,255,.25))" }} />}
          </svg>
        </div>

        {/* explanation */}
        <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.25fr) minmax(0, 1fr)", gap: 16, marginTop: 16 }}>
          <div aria-live="polite" style={{ border: `1px solid ${LINE}`, borderRadius: 18, background: PANEL, padding: "18px 20px", minHeight: 150 }}>
            {caption ? (
              <>
                <div style={{ fontSize: 12, letterSpacing: ".12em", textTransform: "uppercase", color: MUTED }}>{S.chapters.find((c) => c.id === chapter)?.title}</div>
                <p style={{ fontFamily: "var(--font-serif), Georgia, serif", fontSize: 26, lineHeight: 1.25, margin: "10px 0 0" }}>{caption}</p>
              </>
            ) : trail ? (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ fontSize: 12, letterSpacing: ".12em", textTransform: "uppercase", color: MUTED }}>What the voice agent says</div>
                  {trail.prs.length > 0 && <button onClick={walk} style={{ ...btn, marginLeft: "auto", padding: "6px 12px", fontSize: 12.5 }}>▶ Walk me through it</button>}
                </div>
                <ol style={{ margin: "12px 0 0", paddingLeft: 20, lineHeight: 1.55 }}>
                  {trail.sentences.map((s, i) => <li key={i} style={{ marginBottom: 6, color: step < 0 || step === i ? INK : DIM, transition: "color .4s" }}>{s}</li>)}
                </ol>
              </>
            ) : (
              <>
                <div style={{ fontSize: 12, letterSpacing: ".12em", textTransform: "uppercase", color: MUTED }}>How to read it</div>
                <p style={{ lineHeight: 1.6, margin: "10px 0 0", color: "#cfcabe" }}>
                  Left to right is time. Click a lane — <b style={{ color: INK }}>Team Memory</b>, <b style={{ color: INK }}>Leader Desk</b>, <b style={{ color: INK }}>Code Navigator</b> — to see every change that shaped it.
                  Click a dot on the top line to read one pull request. Or press <b style={{ color: INK }}>Play the story</b> for the six chapters.
                </p>
              </>
            )}
          </div>

          <div style={{ border: `1px solid ${LINE}`, borderRadius: 18, background: PANEL, padding: "18px 20px", minHeight: 150 }}>
            {activePR ? (
              <>
                <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                  <span style={{ fontFamily: "var(--font-mono), ui-monospace, monospace", color: MUTED }}>#{activePR.number}</span>
                  <span style={{ fontSize: 19, fontWeight: 650 }}>{activePR.title}</span>
                  <span style={{ marginLeft: "auto", color: MUTED, fontSize: 13 }}>{clock(activePR.mergedAt)}</span>
                </div>
                <p style={{ lineHeight: 1.55, margin: "10px 0", color: "#d9d4c7" }}>{activePR.what}</p>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {activePR.areas.map((a) => <span key={a} style={{ fontSize: 12, padding: "3px 9px", borderRadius: 999, border: `1px solid ${AREA.get(a)?.color}55`, color: AREA.get(a)?.color }}>{AREA.get(a)?.label}</span>)}
                </div>
                <div style={{ color: MUTED, fontSize: 12.5, marginTop: 12, lineHeight: 1.6 }}>
                  By {activePR.authors.join(", ")} · {activePR.filesChanged} files · mostly {activePR.topFolders.slice(0, 2).join(", ")}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <a href={`${REPO}/pull/${activePR.number}`} target="_blank" rel="noreferrer" style={{ ...btn, textDecoration: "none", padding: "6px 12px", fontSize: 12.5 }}>Open PR ↗</a>
                  <a href={`${REPO}/commit/${activePR.mergeSha}`} target="_blank" rel="noreferrer" style={{ ...btn, textDecoration: "none", padding: "6px 12px", fontSize: 12.5, fontFamily: "var(--font-mono), ui-monospace, monospace" }}>{activePR.mergeSha} ↗</a>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 12, letterSpacing: ".12em", textTransform: "uppercase", color: MUTED }}>The parts of the product</div>
                <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
                  {S.areas.map((a) => (
                    <button key={a.id} onClick={() => pickArea(a.id)} style={{ display: "flex", gap: 10, alignItems: "baseline", background: "none", border: 0, padding: 0, color: INK, cursor: "pointer", textAlign: "left", font: "inherit", fontSize: 13.5 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 8, background: a.color, flex: "none", transform: "translateY(-1px)" }} />
                      <span><b style={{ fontWeight: 600 }}>{a.label}</b> <span style={{ color: MUTED }}>— {a.plain}</span></span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </section>
        <p style={{ color: DIM, fontSize: 12, marginTop: 14 }}>
          Built from git history of {S.repository} at {S.generatedFromSha} (merge times, authors, files changed). One-line summaries are written by hand for listening; open any PR for the full detail. Machine-readable: <a href="/api/story" style={{ color: MUTED }}>/api/story?q=…</a>
        </p>
      </main>
    </div>
  );
}
