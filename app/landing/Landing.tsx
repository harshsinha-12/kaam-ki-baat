"use client";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import s from "./landing.module.css";
import graphData from "../../data/demo/codegraph.json";
import { AgentGlyph } from "../components/AgentGlyph";
import { BrandMark } from "../components/BrandMark";
import { VoiceWave } from "../components/VoiceWave";
import { DemoGraph } from "../components/DemoGraph";
import { Escalation, Hears } from "./Stories";

// Kaam Ki Baat landing. The page explains the product by doing it: look left
// for Team Memory, face front for the Leader Desk, look right for the Code
// Navigator. No motion libraries: CSS, SVG and requestAnimationFrame only.
// Everything settles to a static layout when prefers-reduced-motion is set.

type Zone = "team_memory" | "leader_desk" | "code_navigator";
const ZONES: Zone[] = ["team_memory", "leader_desk", "code_navigator"];
const REPO = "https://github.com/harshsinha-12/kaam-ki-baat";
const ReducedMotion = createContext(true);

// Muted accents. Colour marks which agent is speaking; it never decorates.
const ZONE_HEX: Record<Zone, string> = { team_memory: "#7ab8ff", leader_desk: "#ffc84a", code_navigator: "#ff8c6b" };

function useMotionPreference() {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(preference.matches);
    update();
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);
  return reduced;
}

type Script = { label: string; key: string; side: string; role: string; ask: string; say: string; source: string; status: string; done: boolean };
const SCRIPT: Record<Zone, Script> = {
  team_memory: {
    label: "Team Memory", key: "←", side: "Look left", role: "What the team decided",
    ask: "Code freeze kab hai, 3:30 ya 3:45?",
    say: "That was only proposed, not confirmed. I won't guess. Want me to ask Charan, the lead?",
    source: "Wispr notes · Sprint sync, 11:04 · passage 11", status: "Proposed, not confirmed", done: false,
  },
  leader_desk: {
    label: "Leader Desk", key: "↑", side: "Face front", role: "Ask the lead",
    ask: "Harsh is asking: what is the code freeze time?",
    say: "Approved. Freeze at 3:45, once CI is green on the current commit. Saved and read back.",
    source: "Decision v2 · approved by Charan", status: "Confirmed by the lead", done: true,
  },
  code_navigator: {
    label: "Code Navigator", key: "→", side: "Look right", role: "Find it in the code",
    ask: "Woh code kahan hai?",
    say: "Open persist-update.ts at persistVerifiedUpdate, line 25. It shipped in PR #2 and its test passes.",
    source: "kaam-ki-baat @ 63317bd · lines 25 to 41", status: "Matched at the pinned commit", done: true,
  },
};

/* ------------------------------------------------------------------ hooks */
function useInView<T extends Element>(threshold = 0.35, once = true): [RefObject<T | null>, boolean] {
  const reduced = useContext(ReducedMotion);
  const ref = useRef<T>(null);
  const [inView, set] = useState(false);
  useEffect(() => {
    if (!("IntersectionObserver" in window)) { set(true); return; }
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) set(true); else if (!once) set(false); }, { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [threshold, once, reduced]);
  return [ref, inView];
}

function Reveal({ children, i = 0, className = "" }: { children: ReactNode; i?: number; className?: string }) {
  const [ref, inView] = useInView<HTMLDivElement>(0.2);
  const reduced = useContext(ReducedMotion);
  return <div ref={ref} className={`${s.reveal} ${inView || reduced ? s.in : ""} ${className}`} style={{ "--i": i } as CSSProperties}>{children}</div>;
}

const typingTarget = (el: EventTarget | null) => !!(el as HTMLElement | null)?.closest?.("input, textarea, select, [contenteditable=true]");

/* ------------------------------------------------------- the listener */
// You, seen from above: a puck with a heading needle that turns toward the
// agent you picked, the way your head would with AirPods in.
const TURN: Record<Zone, number> = { team_memory: -52, leader_desk: 0, code_navigator: 52 };
function Listener({ zone, speaking }: { zone: Zone; speaking: boolean }) {
  const reduced = useContext(ReducedMotion);
  return (
    <div className={s.listener} style={{ "--zc": ZONE_HEX[zone], "--turn": `${TURN[zone]}deg` } as CSSProperties} aria-hidden>
      <span className={s.listenerHalo} />
      <span className={s.listenerNeedle} />
      <span className={s.listenerPuck}>
        <AirPodsIcon />
        <span className={s.listenerYou}>You</span>
      </span>
      <span className={s.listenerWave} data-on={speaking && !reduced}>{[0, 1, 2, 3, 4].map((i) => <i key={i} style={{ "--i": i } as CSSProperties} />)}</span>
    </div>
  );
}

/* ------------------------------------------------------- agent console */
const SPOT: Record<Zone, [number, number]> = { team_memory: [17, 34], leader_desk: [50, 16], code_navigator: [83, 34] };

function Console({ zone, onZone, autoplay, keyboard }: { zone: Zone; onZone: (z: Zone, manual: boolean) => void; autoplay: boolean; keyboard: boolean }) {
  const reduced = useContext(ReducedMotion);
  const script = SCRIPT[zone];
  const words = script.say.split(" ");
  const [n, setN] = useState(0);
  const [asking, setAsking] = useState(true);
  const [run, setRun] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (reduced) { setAsking(false); setN(words.length); return; }
    setN(0); setAsking(true);
    let id: ReturnType<typeof setInterval> | undefined;
    const t = setTimeout(() => { setAsking(false); id = setInterval(() => setN((x) => (x >= words.length ? x : x + 1)), 85); }, 1500);
    return () => { clearTimeout(t); if (id) clearInterval(id); };
  }, [zone, words.length, reduced, run]);

  useEffect(() => {
    const el = root.current;
    if (!el || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting && e.intersectionRatio > 0.35), { threshold: [0, 0.35, 0.6] });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Arrow keys move between agents the way your head would: left, centre, right.
  useEffect(() => {
    if (!keyboard || !visible) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.metaKey || e.ctrlKey || typingTarget(e.target)) return;
      const i = ZONES.indexOf(zone);
      if (e.key === "ArrowLeft") { e.preventDefault(); onZone(ZONES[Math.max(0, i - 1)], true); }
      else if (e.key === "ArrowRight") { e.preventDefault(); onZone(ZONES[Math.min(2, i + 1)], true); }
      else if (e.key === "ArrowUp") { e.preventDefault(); onZone("leader_desk", true); }
      else if (e.key === "Enter" && root.current?.contains(document.activeElement)) { e.preventDefault(); setRun((r) => r + 1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keyboard, visible, zone, onZone]);

  const idx = ZONES.indexOf(zone);
  const talking = !asking && n < words.length;
  return (
    <div ref={root} className={s.console} style={{ "--zc": ZONE_HEX[zone], "--idx": idx } as CSSProperties} role="group" tabIndex={-1}
      aria-label="Agent demo. Use the left and right arrow keys, or the up arrow for the Leader Desk.">
      <div className={s.tabs} role="tablist" aria-label="Agents">
        <span className={s.tabIndicator} aria-hidden />
        {ZONES.map((z) => (
          <button key={z} type="button" role="tab" aria-selected={zone === z} className={s.tab} onClick={() => onZone(z, true)}>
            <AgentGlyph zone={z} size={20} active={zone === z} reduced />
            <span>{SCRIPT[z].label}</span>
            <kbd className={s.kbd}>{SCRIPT[z].key}</kbd>
          </button>
        ))}
      </div>

      <div className={s.stage}>
        <svg className={s.cones} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          <defs>{ZONES.map((z) => (
            <linearGradient key={z} id={`cone-${z}`} x1={SPOT[z][0] / 100} y1={SPOT[z][1] / 100} x2=".5" y2=".7" gradientUnits="objectBoundingBox">
              <stop offset="0" stopColor={ZONE_HEX[z]} stopOpacity=".26" /><stop offset="1" stopColor={ZONE_HEX[z]} stopOpacity="0" />
            </linearGradient>))}</defs>
          {ZONES.map((z) => (
            <polygon key={z} points={`50,66 ${SPOT[z][0] - 8},${SPOT[z][1] + 4} ${SPOT[z][0] + 8},${SPOT[z][1] + 4}`} fill={`url(#cone-${z})`}
              style={{ opacity: zone === z ? 1 : 0, transition: "opacity .6s cubic-bezier(.16,1,.3,1)" }} />
          ))}
        </svg>
        {ZONES.map((z) => (
          <button key={z} type="button" className={s.agent} data-on={zone === z} onClick={() => onZone(z, true)} aria-label={`${SCRIPT[z].label}: ${SCRIPT[z].side}`}
            style={{ left: `${SPOT[z][0]}%`, top: `${SPOT[z][1]}%` } as CSSProperties}>
            <AgentGlyph zone={z} reduced={reduced} size={zone === z ? 64 : 48} active={zone === z} look={z === "team_memory" ? 1 : z === "code_navigator" ? -1 : 0} />
            <span className={s.agentName}>{SCRIPT[z].label}</span>
            <span className={s.agentSide}>{SCRIPT[z].side}</span>
          </button>
        ))}
        <Listener zone={zone} speaking={asking} />
      </div>

      <div className={s.chat} aria-live="polite">
        <div className={s.msgYou}>
          <span className={s.msgWho}>{zone === "leader_desk" ? "Inbox" : "You"}</span>
          {/* A div, not a p: VoiceWave renders a div, which a p cannot contain (hydration error). */}
          <div className={s.youBubble}>{asking && !reduced ? <span className={s.typingWave}><VoiceWave active color="#d9d9d9" bars={14} height={14} reduced={reduced} /></span> : null}“{script.ask}”</div>
        </div>
        <div className={s.msgAgent} data-on={!asking || reduced}>
          <span className={s.msgWho}><AgentGlyph zone={zone} size={16} active reduced />{script.label}</span>
          <p>{words.map((w, i) => <span key={`${zone}-${run}-${i}`} className={`${s.word} ${i < n ? s.wordOn : ""}`}>{w} </span>)}</p>
          <div className={`${s.meta} ${n >= words.length ? s.metaOn : ""}`}>
            <span className={s.status} data-done={script.done}>{script.status}</span>
            <span className={s.metaSrc}>{script.source}</span>
          </div>
        </div>
      </div>

      <div className={s.consoleFoot}>
        <span className={s.footHint}><kbd className={s.kbd}>←</kbd><kbd className={s.kbd}>→</kbd> switch agents <span className={s.sep} /> <kbd className={s.kbd}>↑</kbd> ask the lead</span>
        <span className={s.progress} aria-hidden>{ZONES.map((z, i) => (
          <i key={z} data-state={i < idx ? "done" : i === idx ? (autoplay && !reduced ? "run" : "done") : "next"}><b key={`${zone}-${run}`} /></i>
        ))}</span>
        {talking && <span className={s.srOnly}>{script.label} is answering</span>}
      </div>
    </div>
  );
}

function HeroConsole() {
  const reduced = useContext(ReducedMotion);
  const [zone, setZone] = useState<Zone>("team_memory");
  const [auto, setAuto] = useState(true);
  useEffect(() => {
    if (!auto || reduced) return;
    const id = setTimeout(() => setZone((z) => ZONES[(ZONES.indexOf(z) + 1) % 3]), 7000);
    return () => clearTimeout(id);
  }, [auto, reduced, zone]);
  const pick = useCallback((z: Zone, manual: boolean) => { if (manual) setAuto(false); setZone(z); }, []);
  return <Console zone={zone} autoplay={auto} keyboard onZone={pick} />;
}

/* ------------------------------------------------------------- problem */
function Person({ on }: { on: boolean }) {
  return <svg viewBox="0 0 24 24" className={s.person} data-on={on} aria-hidden><circle cx="12" cy="7" r="4.2" /><path d="M3.5 22c0-5 3.8-8.2 8.5-8.2s8.5 3.2 8.5 8.2z" /></svg>;
}
function Problem() {
  const reduced = useContext(ReducedMotion);
  const [ref, inView] = useInView<HTMLDivElement>(0.25);
  const run = inView || reduced;
  // The numbers are the sourced claims, so they are printed as measured from
  // the first paint (and in the server HTML). Counting up from 0 put a large
  // "0%" on screen as the section entered. The waffle, bars, ring and clock
  // carry the motion.
  const focus = 68, comm = 57, next = 55, search = 61;
  const WTI = "https://www.microsoft.com/en-us/worklab/work-trend-index/will-ai-fix-work";
  return (
    <div ref={ref} className={s.problem} data-run={run}>
      <article className={s.pCard}>
        <div className={s.pNum}>{focus}<span>%</span></div>
        <p className={s.pText}>of people don’t get enough <b>uninterrupted focus time</b>.</p>
        <div className={s.waffle} aria-hidden>{Array.from({ length: 50 }, (_, i) => <span key={i} style={{ "--d": `${(Math.floor(i / 10) + (i % 10)) * 35}ms` } as CSSProperties}><Person on={i < 34} /></span>)}</div>
        <div className={s.cite}>Microsoft Work Trend Index 2023, 31,000 people · <a href={WTI} target="_blank" rel="noreferrer">source</a></div>
      </article>
      <article className={s.pCard}>
        <div className={s.pNum}>{comm}<span>%</span></div>
        <p className={s.pText}>of the workday goes to <b>meetings, chat and email</b>.</p>
        <div className={s.day} aria-hidden>
          <div className={s.dayBar}>{[["Meetings", 23, 1], ["Chat", 19, .7], ["Email", 15, .45]].map(([l, v, o], i) => <i key={l as string} style={{ "--w": `${v}%`, "--o": o, "--d": `${i * 180}ms` } as CSSProperties} />)}</div>
          <div className={s.dayLegend}><span>Meetings 23%</span><span>Chat 19%</span><span>Email 15%</span><span className={s.dim}>Focused work 43%</span></div>
        </div>
        <div className={s.cite}>Microsoft Work Trend Index 2023, Microsoft 365 usage · <a href={WTI} target="_blank" rel="noreferrer">source</a></div>
      </article>
      <article className={s.pCard}>
        <div className={s.pNum}>{next}<span>%</span></div>
        <p className={s.pText}>say <b>next steps are unclear</b> when a meeting ends.</p>
        <svg className={s.ring} viewBox="0 0 120 120" aria-hidden><circle cx="60" cy="60" r="48" /><circle cx="60" cy="60" r="48" pathLength={100} style={{ "--p": 55 } as CSSProperties} /></svg>
        <div className={s.cite}>Microsoft Work Trend Index 2023 · <a href={WTI} target="_blank" rel="noreferrer">source</a></div>
      </article>
      <article className={s.pCard}>
        <div className={s.pNum}>{search}<span>%</span></div>
        <p className={s.pText}>of developers spend <b>30+ minutes a day</b> searching for answers.</p>
        <svg className={s.clock} viewBox="0 0 120 120" aria-hidden>
          <path className={s.clockWedge} d="M60 60 L60 10 A50 50 0 0 1 60 110 Z" />
          {Array.from({ length: 60 }, (_, i) => { const ang = (i / 60) * Math.PI * 2 - Math.PI / 2;
            // Rounded: server and browser Math.cos can differ in the last digit (hydration mismatch).
            const r3 = (v: number) => Math.round(v * 1000) / 1000;
            return <line key={i} x1={r3(60 + 44 * Math.cos(ang))} y1={r3(60 + 44 * Math.sin(ang))} x2={r3(60 + (i % 5 ? 50 : 53) * Math.cos(ang))} y2={r3(60 + (i % 5 ? 50 : 53) * Math.sin(ang))} stroke={i % 5 ? "#2a2a2a" : "#6a6a6a"} strokeWidth={i % 5 ? 1.5 : 2.5} strokeLinecap="round" />; })}
          <line className={s.clockHand} x1="60" y1="60" x2="60" y2="18" />
          <circle cx="60" cy="60" r="3.5" fill="#fafafa" />
        </svg>
        <div className={s.cite}>Stack Overflow Developer Survey 2024 · <a href="https://survey.stackoverflow.co/2024/professional-developers" target="_blank" rel="noreferrer">source</a></div>
      </article>
    </div>
  );
}

/* ------------------------------------------------------------- evals */
// Real numbers: docs/codegraph/EVAL.md (28 dev questions), GitHub Actions test
// counts on every push on 15 Nov, and the seven recorded Bolna attempts.
const SEARCH_EVAL: [string, number | null, string][] = [["grep", null, "files only"], ["Keyword (BM25)", 46, "baseline"], ["First graph", 39, "one seed"], ["Semantic graph", 93, "ours"]];
const TEST_HISTORY: [string, number][] = [["10:14", 148], ["10:16", 155], ["10:18", 158], ["10:19", 155], ["10:21", 156], ["10:24", 156], ["10:25", 167], ["10:31", 169], ["10:43", 172], ["10:47", 173], ["10:48", 173], ["10:53", 173], ["11:01", 173], ["11:03", 179], ["11:20", 183], ["11:24", 187], ["11:27", 193], ["11:38", 193], ["11:44", 193], ["11:51", 203], ["11:58", 193], ["12:05", 194], ["12:08", 207], ["12:11", 207], ["12:21", 217], ["12:45", 220], ["20:19", 223]];
const CALLS: [string, number, "ok" | "err" | "web" | "idle"][] = [["Phone", 48, "ok"], ["Phone", 94, "err"], ["Phone", 50, "ok"], ["Browser", 158.5, "web"], ["Browser", 102.1, "web"], ["Browser", 11.3, "idle"], ["Browser", 0, "idle"]];
function Evals() {
  const reduced = useContext(ReducedMotion);
  const [ref, inView] = useInView<HTMLDivElement>(0.25);
  const run = inView || reduced;
  const lo = 140, hi = 230, W = 560, H = 220;
  const pts = TEST_HISTORY.map(([, v], i) => `${((i / (TEST_HISTORY.length - 1)) * W).toFixed(1)},${(H - ((v - lo) / (hi - lo)) * H).toFixed(1)}`).join(" ");
  const last = TEST_HISTORY[TEST_HISTORY.length - 1];
  return (
    <div ref={ref} className={s.evals} data-run={run}>
      <article className={s.eCard}>
        <header><h3>Code search</h3><span>Right function in the top 3 · 28 questions</span></header>
        <div className={s.bars}>
          {SEARCH_EVAL.map(([l, v, sub], i) => (
            <div key={l} className={s.barCol} data-hl={i === 3}>
              <b>{v == null ? "n/a" : `${v}%`}</b>
              <div className={s.barTrack}><i style={{ "--h": `${v ?? 0}%`, "--d": `${i * 120}ms` } as CSSProperties} /></div>
              <span>{l}</span><small>{sub}</small>
            </div>))}
        </div>
        <p className={s.eNote}>Held-out set of 12 questions never used for tuning: 33% vs 17%. <a href={`${REPO}/blob/main/docs/codegraph/EVAL.md`} target="_blank" rel="noreferrer">Full eval</a></p>
      </article>
      <article className={s.eCard}>
        <header><h3>Tests on every push</h3><span>GitHub Actions, 15 Nov · 0 failures</span></header>
        <svg className={s.trendSvg} viewBox={`-10 -20 ${W + 20} ${H + 40}`} preserveAspectRatio="none" aria-label={`Passing tests rose from ${TEST_HISTORY[0][1]} to ${last[1]}`}>
          {[150, 175, 200, 225].map((g) => <line key={g} x1="0" x2={W} y1={H - ((g - lo) / (hi - lo)) * H} y2={H - ((g - lo) / (hi - lo)) * H} className={s.grid} />)}
          <polyline points={pts} pathLength={1} className={s.trend} />
        </svg>
        <div className={s.lineFoot}><span>{TEST_HISTORY[0][1]} at {TEST_HISTORY[0][0]}</span><b>{last[1]} / {last[1]} passing</b></div>
      </article>
      <article className={s.eCard}>
        <header><h3>Every call, evaluated</h3><span>7 Bolna attempts · 45 s quality gate</span></header>
        <div className={s.calls}>
          <i className={s.gate} style={{ left: `calc(64px + (100% - 124px) * ${45 / 170})` }}><span>45 s</span></i>
          {CALLS.map(([ch, sec, k], i) => (
            <div key={i} className={s.callRow}><span>{ch}</span><div><i data-k={k} style={{ "--w": `${Math.max(1, (sec / 170) * 100)}%`, "--d": `${i * 90}ms` } as CSSProperties} /></div><b>{sec}s</b></div>))}
        </div>
        <p className={s.eNote}>The 94 s call ended with a voice-provider error. Each call has a written review. <a href="/evals">Open call evals</a></p>
      </article>
    </div>
  );
}

const LOOP = [
  { t: "Meeting ends", m: "“Someone will own it.”" },
  { t: "Slack ping", m: "“Wait, who owns this?”" },
  { t: "Waiting", m: "The lead is in 4 meetings" },
  { t: "A guess", m: "“I think it was merged.”" },
  { t: "Rework", m: "Wrong commit, old CI" },
];
function DoubtLoop() {
  const reduced = useContext(ReducedMotion);
  const [ref, inView] = useInView<HTMLDivElement>(0.2, false);
  const [sec, setSec] = useState(0);
  const [step, setStep] = useState(0);
  // Timers run only while the section is on screen.
  useEffect(() => { if (reduced || !inView) return; const id = setInterval(() => { setSec((x) => x + 1); }, 1000); return () => clearInterval(id); }, [reduced, inView]);
  useEffect(() => { if (reduced || !inView) return; const id = setInterval(() => setStep((x) => (x + 1) % LOOP.length), 1800); return () => clearInterval(id); }, [reduced, inView]);
  return (
    <div ref={ref} className={s.loopGrid}>
      <div>
        <Reveal><h3 className={s.h3}>Every team runs the doubt loop. Nobody owns it.</h3></Reveal>
        <Reveal i={2}><p className={s.lede}>The decision was spoken, then never written down properly. The code changed, but nobody checked which commit. The one person who knows is busy. So people guess, and guesses ship.</p></Reveal>
        <Reveal i={3}><div className={s.timer}><span className={s.timerDot} />Someone has been waiting <b>{Math.floor(sec / 60)}:{String(sec % 60).padStart(2, "0")}</b> for an answer.</div></Reveal>
      </div>
      <ol className={s.loop} aria-label="Meeting ends, Slack ping, waiting, a guess, rework, and back again">
        <svg className={s.loopRing} viewBox="0 0 100 100" aria-hidden><circle cx="50" cy="50" r="38" /></svg>
        {LOOP.map((n, i) => {
          const a = (i / LOOP.length) * Math.PI * 2 - Math.PI / 2;
          return (
            <li key={n.t} className={s.loopNode} data-on={i === step} style={{ left: `${50 + 38 * Math.cos(a)}%`, top: `${50 + 38 * Math.sin(a)}%` }}>
              <strong>{n.t}</strong><span>{n.m}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* ------------------------------------------------------------- agents */
const DIVE: { z: Zone; n: string; title: string; body: string; points: string[] }[] = [
  { z: "team_memory", n: "01", title: "Team Memory answers only what was approved.", body: "Ask in Hindi, English or both, and correct yourself mid-sentence. It answers from approved Wispr meeting passages and verified decisions, and cites who said it. If something was only proposed, it says so instead of filling the gap.", points: ["Proposed is never reported as decided", "Understands Hinglish and self-corrections", "Unknowns go to the lead, not to a guess"] },
  { z: "leader_desk", n: "02", title: "Leader Desk is one inbox for every open doubt.", body: "Facing front only selects the desk. Opening it takes the lead's verified role and a fresh passkey check. The lead answers, adds conditions if needed, and confirms. The decision is versioned, saved, read back, then sent to whoever asked.", points: ["Lead only, verified with a passkey", "Conditions stay attached to the answer", "Saved means read back, every time"] },
  { z: "code_navigator", n: "03", title: "Code Navigator finds the exact line, at the exact commit.", body: "It walks the repository's code graph to the file, function, line range and nearest test, pinned to a commit. A match it cannot confirm stays marked as a candidate. It never edits, merges or deploys.", points: ["Pinned to a commit", "Candidate and confirmed are kept apart", "Flags CI results from an older commit"] },
];

function AgentsDive() {
  const [zone, setZone] = useState<Zone>("team_memory");
  const pick = useCallback((z: Zone) => setZone(z), []);
  return (
    <div className={s.dive}>
      <div className={s.diveList}>
        {DIVE.map((d) => (
          <button key={d.z} type="button" className={s.diveItem} data-on={zone === d.z} onClick={() => setZone(d.z)} style={{ "--c": ZONE_HEX[d.z] } as CSSProperties}>
            <span className={s.diveNum}>{d.n}</span>
            <span className={s.diveText}>
              <span className={s.diveTitle}>{d.title}</span>
              <span className={s.diveBody}>{d.body}</span>
              <span className={s.divePoints}>{d.points.map((p) => <span key={p}>{p}</span>)}</span>
            </span>
          </button>
        ))}
      </div>
      <div className={s.diveStage}><Console zone={zone} autoplay={false} keyboard onZone={pick} /></div>
    </div>
  );
}

/* ------------------------------------------------------------- for the lead */
const TEAM = [
  { who: "Harsh", init: "HS", result: "Understood. Freeze at 3:45 once CI is green.", ok: true, at: 1.2 },
  { who: "Neha", init: "NK", result: "Asked a follow-up: does the freeze include docs?", ok: false, at: 2.6 },
  { who: "Aman", init: "AM", result: "Understood. Owns the CI fix, due 3:30.", ok: true, at: 3.9 },
];
const WALK = [
  { k: "Decision", v: "Code freeze 3:45" },
  { k: "Task", v: "Gate saves on CI" },
  { k: "PR", v: "#42 merged" },
  { k: "File", v: "persist-update.ts" },
  { k: "Function", v: "persistVerifiedUpdate" },
  { k: "Test", v: "persist-update.test.ts" },
];
const DIFF = [
  { n: 35, t: "export async function persistVerifiedUpdate(task: Task) {", k: "" },
  { n: 36, t: "  const ci = await checks.forCommit(task.sha)", k: "add" },
  { n: 37, t: "  if (!ci.green) return { saved: false, reason: \"CI not green\" }", k: "add" },
  { n: 38, t: "  const saved = await store.write(task)", k: "" },
  { n: 39, t: "  return store.readBack(saved)", k: "" },
];

function LeadDesk() {
  const reduced = useContext(ReducedMotion);
  const [ref, inView] = useInView<HTMLDivElement>(0.35);
  const [t, setT] = useState(0);
  const [run, setRun] = useState(0);
  useEffect(() => {
    if (!inView) return;
    if (reduced) { setT(99); return; }
    setT(0);
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => { const v = (now - t0) / 1000; setT(v); if (v < 12) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, reduced, run]);
  const asked = "Did everyone get the 3:45 freeze? What changed in the code since?";
  const typed = asked.slice(0, Math.floor(Math.max(0, t) * 38));
  const walkAt = (i: number) => 5.2 + i * 0.55;
  const hop = WALK.reduce((acc, _, i) => (t >= walkAt(i) ? i : acc), -1);
  const diffOn = t >= walkAt(WALK.length - 1) + 0.5;
  return (
    <div ref={ref} className={s.lead}>
      <div className={s.leadCopy}>
        <Reveal><h2 className={s.h2}>One desk to check that the whole team got it.</h2></Reveal>
        <Reveal i={2}><p className={s.lede}>Ask the Leader Desk once. It calls each teammate through Bolna to confirm they understood, and walks the code graph to show what actually changed in the repository since the meeting.</p></Reveal>
        <Reveal i={3}><ul className={s.leadPoints}>
          <li><b>Calls, not reminders.</b> Each teammate hears the decision and confirms it in their own words.</li>
          <li><b>Follow-ups come back to you.</b> Open questions land in your inbox, never as a guess.</li>
          <li><b>The code is the proof.</b> The graph walk ends at the exact lines that changed, with the test that covers them.</li>
        </ul></Reveal>
      </div>
      <div className={s.leadPanel}>
        <div className={s.leadBar}>
          <span className={s.leadWho}><AgentGlyph zone="leader_desk" size={18} active reduced />Leader Desk</span>
          <button type="button" className={`${s.btn} ${s.small}`} onClick={() => setRun((r) => r + 1)}>Replay</button>
        </div>
        <div className={s.leadAsk}><span className={s.leadAvatar}>CR</span><p>{typed}{typed.length < asked.length && <span className={s.caret} />}</p></div>

        <div className={s.leadBlock}>
          <div className={s.blockHead}><span>Team check</span><span className={s.blockSub}>via Bolna calls</span></div>
          {TEAM.map((m) => {
            const calling = t >= m.at - 0.9 && t < m.at, done = t >= m.at;
            return (
              <div key={m.who} className={s.member} data-state={done ? (m.ok ? "ok" : "ask") : calling ? "calling" : "idle"}>
                <span className={s.avatar}>{m.init}</span>
                <span className={s.memberName}>{m.who}</span>
                <span className={s.memberResult}>{done ? m.result : calling ? "Calling…" : "Waiting"}</span>
                <span className={s.memberState}>{done ? (m.ok ? "Confirmed" : "Follow-up") : calling ? <span className={s.spinner} /> : ""}</span>
              </div>
            );
          })}
        </div>

        <div className={s.leadBlock}>
          <div className={s.blockHead}><span>Code since the meeting</span><span className={s.blockSub}>graph walk</span></div>
          <div className={s.walk}>
            {WALK.map((w, i) => (
              <span key={w.k} className={s.hop} data-on={i <= hop} data-current={i === hop}>
                <small>{w.k}</small>{w.v}
              </span>
            ))}
          </div>
          <div className={s.diff} data-on={diffOn}>
            <div className={s.diffHead}>lib/core/persist-update.ts <span>PR #42 · CI passing</span></div>
            {DIFF.map((l) => <div key={l.n} className={s.diffLine} data-k={l.k}><span className={s.ln}>{l.n}</span><span className={s.sign}>{l.k === "add" ? "+" : " "}</span><code>{l.t}</code></div>)}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- guards */
const GUARDS: { q: string; bad: string; badNote?: string; good: string; why: string }[] = [
  { q: "Is it merged?", bad: "Yes, the PR is done.", good: "PR #2 is open, not merged.", why: "An open PR is never reported as shipped." },
  { q: "Did CI pass?", bad: "Yes, all green.", good: "Green on a1b2c3d, an older commit.", why: "A pass on an older commit does not verify the current one." },
  { q: "Am I the owner?", bad: "Yes, you were assigned.", good: "Only proposed so far. Should I ask Charan?", why: "Mentioned, assigned and accepted are kept apart." },
  { q: "Mark it done.", bad: "Saved!", badNote: "it had timed out", good: "Saved and read back, version 3.", why: "A timeout is a failure, and it says so out loud." },
  { q: "I turned to the leader desk.", bad: "Welcome, leader.", good: "Selected. Confirm with your passkey.", why: "A head turn only selects. Identity is a server role plus a passkey." },
  { q: "(cut off mid-sentence)", bad: "The fact is lost.", good: "Also, before I forget: freeze needs green CI.", why: "Unsaid critical facts come back after an interruption." },
];

function Guards() {
  const [ref, inView] = useInView<HTMLDivElement>(0.2);
  const reduced = useContext(ReducedMotion);
  return (
    <div ref={ref} className={s.guards} data-run={inView || reduced} role="table" aria-label="What a typical chatbot says compared with Kaam Ki Baat">
      <div className={s.gRow} data-head role="row">
        <span role="columnheader">You ask</span>
        <span role="columnheader">A typical chatbot</span>
        <span role="columnheader"><BrandMark size={16} blink={false} />Kaam Ki Baat</span>
      </div>
      {GUARDS.map((g, i) => (
        <div key={g.q} className={s.gRow} role="row" style={{ "--i": i } as CSSProperties}>
          <span role="cell" className={s.gQ}>{g.q}</span>
          <span role="cell" className={s.gBad}><span className={s.xMark} aria-hidden>✕</span><span><s>{g.bad}</s>{g.badNote && <small> ({g.badNote})</small>}</span></span>
          <span role="cell" className={s.gGood}><span className={s.okMark} aria-hidden>✓</span><span><b>{g.good}</b><small>{g.why}</small></span></span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------- code */
const CODE = [
  "export async function persistVerifiedUpdate(args: {",
  "  raw: unknown;",
  "  trustedActorId: string | null;",
  "  authorizedTaskIds: ReadonlySet<string>;",
  "  repository: UpdateRepository;",
  "}): Promise<PersistResult> {",
  "  const parsed = parseTaskUpdate(args.raw);",
  "  if (!parsed.ok) return { saved: false, reason: parsed.reason };",
  "  const req = parsed.value;",
  "  if (!args.trustedActorId || !args.authorizedTaskIds.has(req.taskId))",
  "    return { saved: false, reason: \"unauthorized\" };",
];
const FIRST_LINE = 25;
const HOT = new Set([0, 9, 10]);

function CodeNav() {
  const [ref, inView] = useInView<HTMLDivElement>(0.4);
  return (
    <div ref={ref} className={s.codeBox}>
      <div className={s.codeHead}>
        <span><span className={s.codeRepo}>harshsinha-12/kaam-ki-baat</span> · lib/core/persist-update.ts</span>
        <span className={s.codeOk}>Confirmed at 63317bd</span>
      </div>
      <div className={s.codeBody}>
        {CODE.map((l, i) => (
          <div key={i} className={`${s.cl} ${inView && HOT.has(i) ? s.clHot : ""}`} style={{ "--i": i } as CSSProperties}>
            <span className={s.ln}>{FIRST_LINE + i}</span><span className={s.code}>{l || " "}</span>
          </div>
        ))}
      </div>
      <div className={s.codeFoot}>
        <span>Next: npm test -- tests/persist-update.test.ts</span><a href={`${REPO}/blob/63317bd/lib/core/persist-update.ts#L25-L41`} target="_blank" rel="noreferrer">Open at 63317bd ↗</a>
      </div>
    </div>
  );
}

function Architecture() {
  const col = (x: number, items: { t: string; m: string; c?: string }[]) =>
    items.map((it, i) => (
      <g key={it.t}>
        <rect x={x} y={30 + i * 78} width="190" height="56" rx="12" className={s.archBox} />
        {it.c && <circle cx={x + 18} cy={58 + i * 78} r="4" fill={it.c} />}
        <text x={x + (it.c ? 32 : 16)} y={54 + i * 78} className={s.archText}>{it.t}</text>
        <text x={x + (it.c ? 32 : 16)} y={72 + i * 78} className={s.archSub}>{it.m}</text>
      </g>
    ));
  return (
    <svg viewBox="0 0 1000 340" className={s.archSvg} role="img" aria-label="Sources flow into the evidence engine, which serves the three agents and the Bolna voice runtime">
      {[0, 1, 2, 3].map((i) => <path key={`a${i}`} d={`M220 ${58 + i * 78} C 300 ${58 + i * 78}, 320 170, 400 170`} className={s.flow} />)}
      {[0, 1, 2, 3].map((i) => <path key={`b${i}`} d={`M600 170 C 680 170, 700 ${58 + i * 78}, 780 ${58 + i * 78}`} className={s.flow} />)}
      {col(30, [
        { t: "Wispr Flow MCP", m: "one approved meeting" },
        { t: "GitHub", m: "one repo, commit-pinned" },
        { t: "Live speech", m: "opt-in, provisional" },
        { t: "Head turn or tap", m: "AirPods, webcam, keys" },
      ])}
      <rect x="400" y="96" width="200" height="148" rx="18" className={s.archCore} />
      <text x="500" y="140" textAnchor="middle" className={s.archText}>Evidence engine</text>
      <text x="500" y="162" textAnchor="middle" className={s.archSub}>roles, consent, reconcile</text>
      <text x="500" y="180" textAnchor="middle" className={s.archSub}>versioned memory</text>
      <text x="500" y="198" textAnchor="middle" className={s.archSub}>work and call ledgers</text>
      {col(780, [
        { t: "Team Memory", m: "left, members", c: ZONE_HEX.team_memory },
        { t: "Leader Desk", m: "centre, lead only", c: ZONE_HEX.leader_desk },
        { t: "Code Navigator", m: "right, repo access", c: ZONE_HEX.code_navigator },
        { t: "Bolna voice", m: "phone, 5 HTTPS tools" },
      ])}
    </svg>
  );
}

/* ------------------------------------------------------------- nav */
const NAV = [
  { id: "demo", label: "Demo" },
  { id: "problem", label: "Why" },
  { id: "hears", label: "How it hears" },
  { id: "agents", label: "Agents" },
  { id: "leads", label: "For leads" },
  { id: "guards", label: "Guards" },
  { id: "evals", label: "Evals" },
];

function Nav() {
  const [active, setActive] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const bar = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) setActive(e.target.id); });
    }, { rootMargin: "-40% 0px -55% 0px" });
    NAV.forEach((n) => { const el = document.getElementById(n.id); if (el) io.observe(el); });
    const top = document.getElementById("top");
    const ioTop = new IntersectionObserver(([e]) => { if (e.isIntersecting) setActive(null); }, { rootMargin: "0px 0px -60% 0px" });
    if (top) ioTop.observe(top);
    return () => { window.removeEventListener("scroll", onScroll); io.disconnect(); ioTop.disconnect(); };
  }, []);
  useLayoutEffect(() => {
    const measure = () => {
      const el = active ? bar.current?.querySelector<HTMLAnchorElement>(`a[data-id="${active}"]`) : null;
      setPill(el ? { x: el.offsetLeft, w: el.offsetWidth } : null);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [active]);
  return (
    <nav className={s.nav} data-scrolled={scrolled}>
      <div className={s.navInner}>
        <a href="#top" className={s.brand}><BrandMark size={30} track /><span>Kaam Ki Baat<small lang="hi">काम की बात</small></span></a>
        <div ref={bar} className={s.navBar}>
          <span className={s.navPill} data-on={!!pill} style={pill ? { transform: `translateX(${pill.x}px)`, width: pill.w } : undefined} aria-hidden />
          {NAV.map((n) => <a key={n.id} href={`#${n.id}`} data-id={n.id} aria-current={active === n.id ? "true" : undefined}>{n.label}</a>)}
        </div>
        <div className={s.navCta}>
          <a href={REPO} target="_blank" rel="noreferrer" className={`${s.btn} ${s.ghost} ${s.icon}`} aria-label="Source on GitHub"><GitHubIcon /></a>
          <a href="/team" className={`${s.btn} ${s.primary}`}>Open workspace</a>
        </div>
      </div>
    </nav>
  );
}

function GitHubIcon({ size = 18 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.7 5.4-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" /></svg>;
}

function SectionHead({ title, lede, children }: { title: ReactNode; lede?: ReactNode; children?: ReactNode }) {
  return (
    <div className={s.head}>
      <Reveal><h2 className={s.h2}>{title}</h2></Reveal>
      {(lede || children) && <Reveal i={1} className={s.headSide}>{lede && <p className={s.lede}>{lede}</p>}{children}</Reveal>}
    </div>
  );
}

/* Works-with band: the real inputs and providers, not decoration. */
function Integrations() {
  return (
    <div className={s.band} aria-label="Works with">
      <span className={s.bandLabel}>Runs on</span>
      <span className={s.logoTile} data-kind="img"><img src="/brand/wispr-flow.png" alt="Wispr Flow" height={22} /></span>
      <span className={s.logoTile} data-kind="img"><img src="/brand/bolna.png" alt="Bolna" height={30} /></span>
      <span className={s.logoTile}><GitHubIcon size={18} />GitHub</span>
      <span className={s.bandSep} aria-hidden />
      <span className={s.bandLabel}>Pick an agent with</span>
      <span className={s.logoTile}><AirPodsIcon />AirPods head turn</span>
      <span className={s.logoTile}><WebcamIcon />Webcam</span>
      <span className={s.logoTile}><kbd className={s.kbd}>←</kbd><kbd className={s.kbd}>↑</kbd><kbd className={s.kbd}>→</kbd>Keys</span>
    </div>
  );
}
function AirPodsIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden><path d="M7 3.5a3 3 0 0 0-3 3v1a3 3 0 0 0 3 3h.5v9a1.5 1.5 0 0 0 3 0V6.5a3 3 0 0 0-3-3Z" /><path d="M17 3.5a3 3 0 0 1 3 3v1a3 3 0 0 1-3 3h-.5v9a1.5 1.5 0 0 1-3 0V6.5a3 3 0 0 1 3-3Z" /></svg>;
}
function WebcamIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden><circle cx="12" cy="10" r="7" /><circle cx="12" cy="10" r="2.6" /><path d="M8 21h8M12 17v4" /></svg>;
}

/* ------------------------------------------------------------------ page */
export default function Landing() {
  const reduced = useMotionPreference();
  return (
    <ReducedMotion.Provider value={reduced}><div className={s.page} data-reduced-motion={reduced}>
      <a href="#main" className={s.skip}>Skip to content</a>
      <Nav />

      <main id="main">
        <header id="top" className={s.hero}>
          <div className={s.heroCopy}>
            <span className={s.badge}><span className={s.dotLive} />Built at Build Out Loud, Bengaluru</span>
            <h1 className={s.h1}>
              <span className={s.line}><span>Meeting mein bola.</span></span>
              <span className={s.line}><span>Repo mein bana?</span></span>
            </h1>
            <p className={s.heroSub}>A voice teammate for engineering teams. It remembers what was decided, asks the lead when it isn’t sure, and opens the exact line of code. Every answer comes with its source.</p>
            <div className={s.ctaRow}>
              <a href="/team" className={`${s.btn} ${s.primary} ${s.big}`}>Open workspace</a>
              <a href="#demo" className={`${s.btn} ${s.big}`}>See a question travel</a>
            </div>
            <ol className={s.heroAgents} aria-label="The three agents">
              {ZONES.map((z) => (
                <li key={z} style={{ "--c": ZONE_HEX[z] } as CSSProperties}>
                  <AgentGlyph zone={z} size={30} reduced />
                  <span><b>{SCRIPT[z].label}</b><small>{SCRIPT[z].role}</small></span>
                  <kbd className={s.kbd}>{SCRIPT[z].key}</kbd>
                </li>
              ))}
            </ol>
          </div>
          <div className={s.heroStage}><HeroConsole /></div>
        </header>

        <Integrations />

        <section id="demo" className={s.section}>
          <DemoGraph graph={graphData as never} />
        </section>

        <section id="problem" className={s.section}>
          <SectionHead title="Meetings end. Doubt doesn’t." lede="A decision gets spoken, never written down properly, and an hour later three people remember three different versions. These are the numbers behind that feeling." />
          <Problem />
          <DoubtLoop />
        </section>

        <section id="hears" className={s.section}>
          <SectionHead title="Wispr hears it. The evidence decides it." lede="Half-sentences and Hinglish are fine. What you say is cleaned up, matched to a decision or a function, checked against fixed rules, and only then answered." />
          <Hears />
        </section>

        <section id="agents" className={s.section}>
          <SectionHead title="Where you look decides who answers." lede="Turn left, face front or turn right with AirPods, a webcam or the arrow keys. A turn only picks the agent. You still choose when to talk." />
          <AgentsDive />
        </section>

        <section id="leads" className={s.section}><LeadDesk /></section>

        <section id="escalation" className={s.section}>
          <SectionHead title="From “not sure” to a sourced answer." lede="Unknowns become a question for the lead instead of a guess. The answer comes back with its source, even if you hung up in the meantime." />
          <Escalation />
        </section>

        <section id="guards" className={s.section}>
          <SectionHead title="Confident is easy. Correct is the product." lede="Six questions where a general chatbot sounds helpful and is wrong. Each refusal below is a rule in the code, with a test." />
          <Guards />
        </section>

        <section className={s.section}>
          <SectionHead title="“Kahan hai?” gets a line number." lede="Code Navigator walks the repository graph to a file, a function and the nearest test, pinned to one commit." />
          <CodeNav />
        </section>

        <section id="evals" className={s.section}>
          <SectionHead title="Measured, not guessed." lede="Numbers from our own repository and our own calls. Read them as a regression guard, not a public benchmark." />
          <Evals />
        </section>

        <section id="how" className={s.section}>
          <SectionHead title="Sources in. Evidence out." lede="Wispr supplies reviewed passages from one approved meeting, GitHub supplies commit-pinned code. Fixed rules decide status; the language model only explains." />
          <Architecture />
          <div className={s.statusGrid}>
            <div className={s.statusCol}><h3><span className={s.dotOk} />Works now</h3><ul>
              <li>Evidence engine, three agents, leader escalation with read-back</li>
              <li>Live GitHub reads: PRs, changed files, check runs</li>
              <li>Bolna runtime tools over HTTPS, tested with fixtures</li>
              <li>AirPods motion companion and webcam controls with calibration</li>
            </ul></div>
            <div className={s.statusCol}><h3><span className={s.dotWait} />Next</h3><ul>
              <li>Verify the voice path in a real call</li>
              <li>Three consented phone calls longer than 45 seconds</li>
              <li>Passkey checks on real devices</li>
              <li>Optional realtime sync once tests match</li>
            </ul></div>
          </div>
        </section>

        <section className={s.final}>
          <BrandMark size={84} track />
          <h2 className={s.finalH}>Stop guessing what the team meant.</h2>
          <p className={s.lede}>Open the workspace, connect a repository and ask your first question.</p>
          <div className={s.ctaRow} style={{ justifyContent: "center" }}>
            <a href="/team" className={`${s.btn} ${s.primary} ${s.big}`}>Open workspace</a>
            <a href={`${REPO}/blob/main/docs/architecture.md`} className={`${s.btn} ${s.big}`} target="_blank" rel="noreferrer">Read the architecture</a>
          </div>
        </section>
      </main>

      <footer className={s.footer}>
        <span className={s.footBrand}><BrandMark size={20} blink={false} />Kaam Ki Baat</span>
        <span>Built in three hours at Build Out Loud with Wispr Flow, Bolna and GitHub. Demo conversations are fictional.</span>
        <span className={s.footLinks}><a href="/evals">Call evals</a><a href={REPO} target="_blank" rel="noreferrer">GitHub</a></span>
      </footer>
    </div></ReducedMotion.Provider>
  );
}
