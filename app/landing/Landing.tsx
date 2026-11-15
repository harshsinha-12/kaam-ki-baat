"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import s from "./landing.module.css";
import graphData from "../../data/demo/codegraph.json";
import graphDemo from "../../data/demo/codegraph.demo.json";
import { CodeGraphView, type ViewGraph } from "../components/CodeGraphView";
import { AgentGlyph } from "../components/AgentGlyph";
import { arcLength, catmullRomToBezier, damp, toSvgPath, type V2 } from "../../lib/motion/curves";
import { understand } from "../../lib/core/understand";

// Kaam Ki Baat landing — the page explains the product by *doing* it:
// turn left (Team Memory), face front (Leader Desk), turn right (Code Navigator).
// No external motion libraries: CSS + SVG + rAF, so the build stays dependency-free.
// Everything respects prefers-reduced-motion (see landing.module.css).

type Zone = "team_memory" | "leader_desk" | "code_navigator";
const ZONES: Zone[] = ["team_memory", "leader_desk", "code_navigator"];
const REPO = "https://github.com/harshsinha-12/kaam-ki-baat";
const ReducedMotion = createContext(true);

function useMotionPreference() {
  // Render a static experience until the browser preference is available.
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

const SCRIPT: Record<Zone, { label: string; side: string; sub: string; ask: string; say: string; src: { t: string; ok?: boolean; warn?: boolean }[] }> = {
  team_memory: {
    label: "Team Memory", side: "Look left", sub: "Approved decisions, owners, deadlines — with sources.",
    ask: "Code freeze kab hai, 3:30 ya 3:45?",
    say: "That was only proposed, not confirmed. I won't guess — want me to ask Charan, the lead?",
    src: [{ t: "wispr · sync 11:04 · span 412–498" }, { t: "state: proposed", warn: true }],
  },
  leader_desk: {
    label: "Leader Desk", side: "Face front", sub: "Leader only. Fresh verification. Resolves open questions.",
    ask: "1 pending question from Harsh: code freeze time.",
    say: "Approved: freeze at 3:45 — if CI is green on the current commit. Saved and read back.",
    src: [{ t: "decision v2 · approved by Charan", ok: true }, { t: "read-back ✓", ok: true }],
  },
  code_navigator: {
    label: "Code Navigator", side: "Look right", sub: "Exact repo, commit, file, function, lines and test.",
    ask: "Woh code kahan hai?",
    say: "Open persist-update.ts, the persistVerifiedUpdate function, line 25. It's in the PR — confirmed. Then run its regression test.",
    src: [{ t: "@ 63317bd · L25–L41", ok: true }, { t: "match: confirmed", ok: true }],
  },
};

/* ------------------------------------------------------------------ hooks */
function useInView<T extends Element>(threshold = 0.35): [RefObject<T | null>, boolean] {
  const reduced = useContext(ReducedMotion);
  const ref = useRef<T>(null);
  const [inView, set] = useState(false);
  useEffect(() => {
    if (reduced || !("IntersectionObserver" in window)) { set(true); return; }
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && set(true), { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [threshold, reduced]);
  return [ref, inView];
}

function Reveal({ children, i = 0, as = "div", className = "" }: { children: ReactNode; i?: number; as?: "div" | "p" | "h2"; className?: string }) {
  const [ref, inView] = useInView<HTMLDivElement>(0.2);
  const Tag = as as "div";
  return (
    <Tag ref={ref} className={`${s.reveal} ${inView ? s.in : ""} ${className}`} style={{ "--i": i } as CSSProperties}>
      {children}
    </Tag>
  );
}

function useCountUp(target: number, run: boolean, ms = 1400) {
  const reduced = useContext(ReducedMotion);
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!run || reduced) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      setV(Math.round(target * (1 - Math.pow(1 - p, 4)))); // easeOutQuart
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, run, ms, reduced]);
  return reduced ? target : v;
}

/* ------------------------------------------------------- spatial stage */
// "You", seen from the front, wearing AirPods. The head turns in 3D toward the
// agent you select; a soft light cone lands on that agent.
const TURN: Record<Zone, number> = { team_memory: -28, leader_desk: 0, code_navigator: 28 };
function Listener({ zone, listening }: { zone: Zone; listening: boolean }) {
  const reduced = useContext(ReducedMotion);
  const color = ZONE_HEX[zone];
  const look = zone === "team_memory" ? -1 : zone === "code_navigator" ? 1 : 0;
  const anim = !reduced;
  return (
    <div className={s.listener} aria-hidden>
      <div className={s.listenerHead} style={{ transform: `perspective(480px) rotateY(${TURN[zone]}deg) rotateX(${zone === "leader_desk" ? -5 : 0}deg) rotateZ(${look * -2}deg)` }}>
        <svg viewBox="0 0 140 150" width="100%" height="100%">
          <defs>
            <radialGradient id="kkbSkin" cx="42%" cy="32%" r="75%"><stop offset="0" stopColor="#e7b48c" /><stop offset=".6" stopColor="#c98c63" /><stop offset="1" stopColor="#9c6644" /></radialGradient>
            <linearGradient id="kkbHair" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3a2a22" /><stop offset="1" stopColor="#1c1411" /></linearGradient>
            <linearGradient id="kkbHoodie" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2b2a30" /><stop offset="1" stopColor="#17161a" /></linearGradient>
          </defs>
          {/* sound arcs travel from the agent's side into the ear facing it */}
          {anim && [0, 1, 2].map((i) => (
            <path key={i} d={look >= 0 ? "M124 54 q10 12 0 24" : "M16 54 q-10 12 0 24"} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" opacity="0"
              transform={`translate(${(look >= 0 ? 1 : -1) * i * 7} 0)`}>
              <animate attributeName="opacity" values="0;.8;0" dur="1.6s" begin={`${i * 0.25}s`} repeatCount="indefinite" />
            </path>
          ))}
          <g>
            {anim && <animateTransform attributeName="transform" type="translate" values="0 0;0 -1.4;0 0" dur="4s" repeatCount="indefinite" />}
            {/* shoulders + hoodie with a zone-coloured drawstring */}
            <path d="M14 150 C18 120 42 108 70 108 C98 108 122 120 126 150 Z" fill="url(#kkbHoodie)" stroke="#34323a" />
            <path d="M52 110 C58 124 82 124 88 110" fill="none" stroke="#3b3942" strokeWidth="2" />
            <path d="M62 118 v14 M78 118 v14" stroke={color} strokeWidth="2" strokeLinecap="round" style={{ transition: "stroke .5s" }} />
            <rect x="59" y="88" width="22" height="24" rx="9" fill="#b97d56" />
            {/* head */}
            <ellipse cx="70" cy="60" rx="33" ry="38" fill="url(#kkbSkin)" />
            <path d="M37 56 C36 26 56 16 72 17 C92 18 106 32 103 58 C99 44 88 36 76 35 C62 34 46 40 37 56 Z" fill="url(#kkbHair)" />
            <path d="M58 22 C66 18 80 18 88 24" stroke="#5a463b" strokeWidth="2" fill="none" strokeLinecap="round" opacity=".7" />
            {/* face: eyes follow the agent, blink; mouth moves while the agent is talking */}
            <g style={{ transform: `translateX(${look * 6}px)`, transition: "transform .7s cubic-bezier(.16,1,.3,1)" }}>
              <path d="M52 52 q5 -3 10 0 M78 52 q5 -3 10 0" stroke="#3a2a22" strokeWidth="2" fill="none" strokeLinecap="round" />
              {[57, 83].map((x) => (
                <g key={x}>
                  <ellipse cx={x} cy="61" rx="4.2" ry="4.8" fill="#fff" />
                  <circle cx={x + look * 1.4} cy="61.5" r="2.7" fill="#2a1d17" />
                  <circle cx={x + look * 1.4 + 0.9} cy="60.4" r=".9" fill="#fff" />
                  <rect x={x - 5} y="55" width="10" height="0" fill="#c98c63">
                    {anim && <animate attributeName="height" values="0;0;12;0" keyTimes="0;.94;.97;1" dur="4.6s" repeatCount="indefinite" />}
                  </rect>
                </g>
              ))}
              <path d="M70 64 q-2.5 7 1.5 8.5" stroke="#9c6644" strokeWidth="1.8" fill="none" strokeLinecap="round" />
              <ellipse cx="71" cy="82" rx="6" ry="2" fill="#7a3f30">
                {anim && listening && <animate attributeName="ry" values="1.5;3.6;1.2;3;1.5" dur=".9s" repeatCount="indefinite" />}
              </ellipse>
              <circle cx="52" cy="74" r="4" fill="#e58f7a" opacity=".25" /><circle cx="90" cy="74" r="4" fill="#e58f7a" opacity=".25" />
            </g>
            {/* AirPods glow in the active agent's colour */}
            {[[37, 64], [103, 64]].map(([x, y]) => (
              <g key={x}>
                <circle cx={x} cy={y} r="8" fill={color} opacity=".22" style={{ transition: "fill .5s" }} />
                <rect x={x - 3.6} y={y - 6} width="7.2" height="11" rx="3.6" fill="#f7f5ef" />
                <rect x={x - 1.4} y={y + 3} width="2.8" height="9" rx="1.4" fill="#f7f5ef" />
              </g>
            ))}
          </g>
        </svg>
      </div>
      <div className={s.listenerLabel} style={{ color }}>{listening ? "listening…" : "you · airpods"}</div>
    </div>
  );
}

const ZONE_HEX: Record<Zone, string> = { team_memory: "#7cc4ff", leader_desk: "#f5c451", code_navigator: "#ff8a65" };
const SPOT: Record<Zone, [number, number]> = { team_memory: [17, 30], leader_desk: [50, 17], code_navigator: [83, 30] };

function Stage({ zone, onZone, autoplay }: { zone: Zone; onZone: (z: Zone) => void; autoplay: boolean }) {
  const reduced = useContext(ReducedMotion);
  const script = SCRIPT[zone];
  const words = script.say.split(" ");
  const [n, setN] = useState(0);
  useEffect(() => {
    if (reduced) return;
    setN(0);
    const id = setInterval(() => setN((x) => (x >= words.length ? x : x + 1)), 95);
    return () => clearInterval(id);
  }, [zone, words.length, reduced]);
  const visibleWords = reduced ? words.length : n;

  const onKey = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (e.key === "ArrowLeft" || k === "a") onZone("team_memory");
    else if (e.key === "ArrowUp") { e.preventDefault(); onZone("leader_desk"); }
    else if (e.key === "ArrowRight" || k === "l") onZone("code_navigator");
  };

  return (
    <div className={s.stage} tabIndex={0} onKeyDown={onKey} role="group" style={{ "--zc": ZONE_HEX[zone] } as CSSProperties}
      aria-label="Spatial agents demo. Use A or left arrow, up arrow, L or right arrow, or click an agent.">
      <svg className={s.cones} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        <defs>{ZONES.map((z) => (
          <linearGradient key={z} id={`cone-${z}`} x1={SPOT[z][0] / 100} y1={SPOT[z][1] / 100} x2=".5" y2=".62" gradientUnits="objectBoundingBox">
            <stop offset="0" stopColor={ZONE_HEX[z]} stopOpacity=".32" /><stop offset="1" stopColor={ZONE_HEX[z]} stopOpacity="0" />
          </linearGradient>))}</defs>
        {ZONES.map((z) => (
          <polygon key={z} points={`50,58 ${SPOT[z][0] - 9},${SPOT[z][1] + 2} ${SPOT[z][0] + 9},${SPOT[z][1] + 2}`} fill={`url(#cone-${z})`}
            style={{ opacity: zone === z ? 1 : 0, transition: "opacity .6s cubic-bezier(.16,1,.3,1)" }} />
        ))}
      </svg>
      {ZONES.map((z) => (
        <button key={z} type="button" className={s.agent} data-z={z} data-on={zone === z} onClick={() => onZone(z)} aria-pressed={zone === z}
          style={{ left: `${SPOT[z][0]}%`, top: `${SPOT[z][1]}%`, "--c": ZONE_HEX[z] } as CSSProperties}>
          <AgentGlyph zone={z} reduced={reduced} size={zone === z ? 72 : 56} active={zone === z} look={z === "team_memory" ? 1 : z === "code_navigator" ? -1 : 0} />
          <span className={s.agentName}>{SCRIPT[z].label}</span>
          <span className={s.agentKey}>{z === "team_memory" ? "A · look left" : z === "code_navigator" ? "L · look right" : "↑ · face front"}{z === "leader_desk" ? " · leader only" : ""}</span>
        </button>
      ))}
      <Listener zone={zone} listening={visibleWords < words.length} />
      <div className={s.transcript} aria-live="polite">
        <div className={s.who}><span style={{ color: "var(--zc)" }}>● {SCRIPT[zone].label}</span><span>{autoplay ? "demo · fictional team" : "you're driving"}</span></div>
        <div className={s.ask}>“{script.ask}”</div>
        <div className={s.say}>
          {words.map((w, i) => <span key={`${zone}-${i}`} className={`${s.word} ${i < visibleWords ? s.wordOn : ""}`}>{w} </span>)}
        </div>
        <div className={`${s.src} ${visibleWords >= words.length ? s.srcOn : ""}`}>
          {script.src.map((x) => <span key={x.t} className={`${s.tag} ${x.ok ? s.tagOk : ""} ${x.warn ? s.tagWarn : ""}`}>{x.t}</span>)}
        </div>
      </div>
    </div>
  );
}

function HeroStage() {
  const reduced = useContext(ReducedMotion);
  const [zone, setZone] = useState<Zone>("team_memory");
  const [auto, setAuto] = useState(true);
  useEffect(() => {
    if (!auto || reduced) return;
    const id = setInterval(() => setZone((z) => ZONES[(ZONES.indexOf(z) + 1) % 3]), 6500);
    return () => clearInterval(id);
  }, [auto, reduced]);
  return <Stage zone={zone} autoplay={auto && !reduced} onZone={(z) => { setAuto(false); setZone(z); }} />;
}

/* ------------------------------------------------------------- sections */
function Stats() {
  const reduced = useContext(ReducedMotion);
  const [ref, inView] = useInView<HTMLDivElement>(0.3);
  const a = useCountUp(55, inView);
  const b = useCountUp(69, inView);
  const c = useCountUp(61, inView);
  const [lit, setLit] = useState(0);
  useEffect(() => {
    if (!inView || reduced) return;
    const id = setInterval(() => setLit((x) => (x >= 55 ? x : x + 1)), 22);
    return () => clearInterval(id);
  }, [inView, reduced]);
  return (
    <div ref={ref} className={s.stats}>
      <div className={s.stat} data-spot style={{ "--spot": "#f5c451" } as CSSProperties}>
        <span className={s.statTag} style={{ color: "#f5c451", borderColor: "rgba(245,196,81,.35)" }}>unclear after meetings</span>
        <div className={s.big}>{a}<span className={s.pct}>%</span></div>
        <div className={s.dots} aria-hidden>{Array.from({ length: 100 }, (_, i) => <span key={i} style={{ "--i": i } as CSSProperties} className={`${s.dot} ${i < (reduced ? 55 : lit) ? s.dotOn : ""}`} />)}</div>
        <div className={s.statText}>of people say <b>next steps are unclear</b> when a meeting ends.</div>
        <div className={s.cite}>Microsoft Work Trend Index 2023 · 31,000 workers · <a href="https://www.microsoft.com/en-us/worklab/work-trend-index/will-ai-fix-work" target="_blank" rel="noreferrer">source</a></div>
      </div>
      <div className={s.stat} data-spot style={{ "--spot": "#ff8a65" } as CSSProperties}>
        <span className={s.statTag} style={{ color: "#ff8a65", borderColor: "rgba(255,138,101,.35)" }}>time lost</span>
        <div className={s.big}>{b}<span className={s.pct}>%</span></div>
        <div className={s.week} aria-hidden>{["Mon", "Tue", "Wed", "Thu", "Fri"].map((d, i) => (
          <div key={d} className={`${s.day} ${i === 4 && inView ? s.dayLost : ""}`}><span>{d}</span></div>
        ))}</div>
        <div className={s.statText}>of developers lose <b>8+ hours a week</b> to inefficiencies. That's a whole working day.</div>
        <div className={s.cite}>Atlassian × DX, State of DevEx 2024 · <a href="https://www.atlassian.com/blog/development/developer-experience-report-2024" target="_blank" rel="noreferrer">source</a></div>
      </div>
      <div className={s.stat} data-spot style={{ "--spot": "#7cc4ff" } as CSSProperties}>
        <span className={s.statTag} style={{ color: "#7cc4ff", borderColor: "rgba(124,196,255,.35)" }}>waiting for answers</span>
        <div className={s.big}>{c}<span className={s.pct}>%</span></div>
        <svg className={s.clock} viewBox="0 0 120 120" aria-hidden>
          {Array.from({ length: 60 }, (_, i) => { const ang = (i / 60) * Math.PI * 2 - Math.PI / 2; const on = inView && i < 30;
            return <line key={i} x1={60 + 44 * Math.cos(ang)} y1={60 + 44 * Math.sin(ang)} x2={60 + (i % 5 ? 50 : 53) * Math.cos(ang)} y2={60 + (i % 5 ? 50 : 53) * Math.sin(ang)}
              stroke={on ? "#7cc4ff" : "#2a2925"} strokeWidth={i % 5 ? 2 : 3} strokeLinecap="round" style={{ transition: `stroke .3s ${i * 25}ms` }} />; })}
          <text x="60" y="58" textAnchor="middle" className={s.clockBig}>30+</text>
          <text x="60" y="74" textAnchor="middle" className={s.clockSmall}>min / day</text>
        </svg>
        <div className={s.statText}>of developers spend <b>30+ minutes a day</b> searching for answers. 53% say waiting disrupts their flow.</div>
        <div className={s.cite}>Stack Overflow Developer Survey 2024 · <a href="https://survey.stackoverflow.co/2024/professional-developers" target="_blank" rel="noreferrer">source</a></div>
      </div>
    </div>
  );
}

function DoubtLoop() {
  const reduced = useContext(ReducedMotion);
  const [sec, setSec] = useState(0);
  useEffect(() => { if (reduced) return; const id = setInterval(() => setSec((x) => x + 1), 1000); return () => clearInterval(id); }, [reduced]);
  const nodes = [
    { t: "Meeting ends", m: "“someone will own it”" },
    { t: "Slack ping", m: "“wait, who owns this?”" },
    { t: "Waiting", m: "leader in 4 meetings" },
    { t: "A guess", m: "“I think it was merged”" },
    { t: "Rework", m: "wrong SHA, old CI" },
  ];
  const R = 130, cx = 180, cy = 170;
  return (
    <div className={s.loopGrid}>
      <div>
        <Reveal><div className={s.eyebrow}>The doubt loop</div></Reveal>
        <Reveal i={1}><h2 className={s.h2}>Every team runs it. <em>Nobody</em> owns it.</h2></Reveal>
        <Reveal i={2}><p className={s.lede}>The decision was spoken, then never written down properly. The code changed, but nobody checked which commit. The one person who knows is busy. So people guess, and guesses ship.</p></Reveal>
        <Reveal i={3}><div className={s.timer}>{reduced ? "Unresolved questions can leave teammates waiting for a sourced answer." : <>Illustrative waiting timer: <b>{Math.floor(sec / 60)}:{String(sec % 60).padStart(2, "0")}</b>. Unresolved questions can leave teammates blocked.</>}</div></Reveal>
      </div>
      <svg viewBox="0 0 360 340" className={s.loopSvg} role="img" aria-label="Meeting, ping, waiting, guess, rework — and back again">
        <circle cx={cx} cy={cy} r={R} className={s.loopPath} />
        {nodes.map((n, i) => {
          const a = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
          const x = cx + R * Math.cos(a), y = cy + R * Math.sin(a);
          return (
            <g key={n.t}>
              <rect x={x - 62} y={y - 22} width="124" height="44" rx="12" className={s.loopNode} />
              <text x={x} y={y - 3} textAnchor="middle" className={s.loopLabel}>{n.t}</text>
              <text x={x} y={y + 13} textAnchor="middle" className={s.loopMute}>{n.m}</text>
            </g>
          );
        })}
        {!reduced && <circle r="5" fill="var(--warn)"><animateMotion dur="9s" repeatCount="indefinite" path={`M ${cx} ${cy - R} A ${R} ${R} 0 1 1 ${cx - 0.01} ${cy - R}`} /></circle>}
      </svg>
    </div>
  );
}

const DIVE: { z: Zone; n: string; title: string; body: string; chips: string[] }[] = [
  { z: "team_memory", n: "01 · LOOK LEFT", title: "Team Memory answers only what was approved.", body: "Ask in Hindi, English or both, and correct yourself mid-sentence. It answers from approved Wispr meeting passages and verified leader decisions, and it cites the speaker and span. If something was only proposed, it says so, and it never fills the gap with a guess.", chips: ["proposed ≠ accepted", "Hinglish self-corrections", "unknown → ask the leader"] },
  { z: "leader_desk", n: "02 · FACE FRONT", title: "Leader Desk: one inbox for every open doubt.", body: "Facing front only selects the desk. Unlocking it takes the leader's verified role and a fresh step-up. The leader answers, adds conditions if needed, and confirms. The decision is versioned, saved, read back, and then sent to whoever asked.", chips: ["leader only", "conditions stay conditions", "read-back before 'saved'"] },
  { z: "code_navigator", n: "03 · LOOK RIGHT", title: "Code Navigator: the exact line, at the exact commit.", body: "Repo, commit SHA, file, function, line range and the nearest test. It checks every highlight against the pinned commit, and a match it can't confirm stays labeled a candidate. It never edits, merges or deploys.", chips: ["SHA-pinned", "candidate vs confirmed", "stale CI flagged"] },
];

function ZonesDive() {
  const reduced = useContext(ReducedMotion);
  const [active, setActive] = useState<Zone>("team_memory");
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  useEffect(() => {
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && setActive((e.target as HTMLElement).dataset.z as Zone)), { rootMargin: "-45% 0px -45% 0px" });
    refs.current.forEach((r) => r && io.observe(r));
    return () => io.disconnect();
  }, []);
  return (
    <div className={s.scrolly}>
      <div className={s.sticky}><Stage zone={active} autoplay={false} onZone={(z) => { setActive(z); refs.current[ZONES.indexOf(z)]?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" }); }} /></div>
      <div>
        {DIVE.map((d, i) => (
          <div key={d.z} data-z={d.z} ref={(el) => { refs.current[i] = el; }} className={`${s.stepCard} ${active === d.z ? s.stepOn : ""}`}>
            <div className={s.stepNum}>{d.n}</div>
            <h3 className={s.stepTitle}>{d.title}</h3>
            <p className={s.stepBody}>{d.body}</p>
            <div className={s.chips}>{d.chips.map((c) => <span key={c} className={s.chip}>{c}</span>)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const PIPE = [
  { t: "Member asks left", d: "“Code freeze kab hai?”", say: "> memory_ask → proposed only" },
  { t: "No verified answer", d: "Says so. Offers to escalate.", say: "> ticket_create (confirmed: true)" },
  { t: "Leader approves", d: "Verified role, fresh step-up, confirm.", say: "> leader_resolve · expected v1" },
  { t: "Store + read-back", d: "Versioned, append-only, verified.", say: "> decision v2 · read-back ✓ · ctx+1" },
  { t: "Requester gets source", d: "Now, or on the next call.", say: "> “Approved by Charan: …”" },
];

// A C1 Catmull-Rom spline through the step badges; the packet travels it at
// constant speed (arc-length) and eases with frame-rate independent decay.
function SplinePacket({ container, step, count }: { container: RefObject<HTMLDivElement | null>; step: number; count: number }) {
  const [geo, setGeo] = useState<{ d: string; w: number; h: number; pts: V2[] } | null>(null);
  const dot = useRef<SVGCircleElement>(null);
  const trail = useRef<SVGPathElement>(null);
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const badges = [...el.querySelectorAll("[data-badge]")].map((b) => { const q = b.getBoundingClientRect(); return { x: q.left - r.left + q.width / 2, y: q.top - r.top + q.height / 2 }; });
      if (badges.length < 2) return;
      // lift the curve between badges so it reads as a path, not a line
      const pts: V2[] = [];
      badges.forEach((b, i) => { pts.push(b); if (i < badges.length - 1) pts.push({ x: (b.x + badges[i + 1].x) / 2, y: b.y - (i % 2 ? -18 : 18) }); });
      setGeo({ d: toSvgPath(catmullRomToBezier(pts)), w: r.width, h: r.height, pts });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [container]);
  useEffect(() => {
    if (!geo) return;
    const curve = arcLength(catmullRomToBezier(geo.pts), 48);
    const target = step / (count - 1);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let u = reduce ? target : (dot.current?.dataset.u ? Number(dot.current.dataset.u) : 0);
    let last = performance.now(), raf = 0;
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      u = reduce ? target : damp(u, target, 5, dt);
      const p = curve.at(u);
      if (dot.current) { dot.current.setAttribute("cx", String(p.x)); dot.current.setAttribute("cy", String(p.y)); dot.current.dataset.u = String(u); }
      if (trail.current) trail.current.style.strokeDashoffset = String(curve.total * (1 - u));
      if (Math.abs(u - target) > 0.0005) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [geo, step, count]);
  if (!geo) return null;
  const total = arcLength(catmullRomToBezier(geo.pts), 48).total;
  return (
    <svg className={s.splineSvg} width={geo.w} height={geo.h} aria-hidden>
      <path d={geo.d} fill="none" stroke="#2c2a24" strokeWidth="2" strokeDasharray="5 7" />
      <path ref={trail} d={geo.d} fill="none" stroke="url(#kkbTrail)" strokeWidth="2.5" strokeLinecap="round" style={{ strokeDasharray: total, strokeDashoffset: total }} />
      <defs><linearGradient id="kkbTrail" x1="0" x2="1"><stop offset="0" stopColor="#7cc4ff" /><stop offset=".5" stopColor="#f5c451" /><stop offset="1" stopColor="#6fdc8c" /></linearGradient></defs>
      <circle ref={dot} r="7" fill="#f2efe6" style={{ filter: "drop-shadow(0 0 10px rgba(245,196,81,.9))" }} />
    </svg>
  );
}

function Escalation() {
  const reduced = useContext(ReducedMotion);
  const [ref, inView] = useInView<HTMLDivElement>(0.4);
  const [step, setStep] = useState(0);
  const [manual, setManual] = useState(false);
  useEffect(() => {
    if (!inView || manual || reduced) return;
    const id = setInterval(() => setStep((x) => (x + 1) % PIPE.length), 1700);
    return () => clearInterval(id);
  }, [inView, manual, reduced]);
  const pct = (step / (PIPE.length - 1)) * 100;
  return (
    <div ref={ref} className={s.pipe}>
      <SplinePacket container={ref} step={step} count={PIPE.length} />
      {PIPE.map((p, i) => (
        <button key={p.t} type="button" data-spot className={`${s.pStep} ${i <= step ? s.pOn : ""}`} onClick={() => { setManual(true); setStep(i); }}>
          <div className={s.pBadge} data-badge>{i + 1}</div>
          <div className={s.pTitle}>{p.t}</div>
          <div className={s.pText}>{p.d}</div>
          <div className={s.pSay}>{p.say}</div>
        </button>
      ))}
    </div>
  );
}

const GUARDS: { front: ReactNode; back: ReactNode }[] = [
  { front: <><div className={s.gTitle}>“Is it merged?”</div><div><span className={s.strike}>Yes, the PR is done.</span></div></>, back: <><div className={s.gTitle}>PR #2 is <span className={s.mark}>open</span>, not merged.</div><div className={s.statText}>An open PR is never reported as shipped.</div></> },
  { front: <><div className={s.gTitle}>“Did CI pass?”</div><div><span className={s.strike}>Yes, all green.</span></div></>, back: <><div className={s.gTitle}>Green on <span className={s.mark}>a1b2c3d</span>, which is stale.</div><div className={s.statText}>A pass on an older SHA doesn't verify the current head.</div></> },
  { front: <><div className={s.gTitle}>“Am I the owner?”</div><div><span className={s.strike}>Yes, you were assigned.</span></div></>, back: <><div className={s.gTitle}>Only <span className={s.mark}>proposed</span>.</div><div className={s.statText}>Mentioned ≠ assigned ≠ accepted. It offers to ask the leader.</div></> },
  { front: <><div className={s.gTitle}>“Mark it done.”</div><div><span className={s.strike}>Saved!</span> (it timed out)</div></>, back: <><div className={s.gTitle}><span className={s.mark}>Saved</span> only after read-back.</div><div className={s.statText}>A timeout is a failure, said out loud.</div></> },
  { front: <><div className={s.gTitle}>“I turned to the leader zone.”</div><div><span className={s.strike}>Welcome, leader.</span></div></>, back: <><div className={s.gTitle}>A head turn only <span className={s.mark}>selects</span>.</div><div className={s.statText}>Identity is server-side role + step-up. Movement never unlocks anything.</div></> },
  { front: <><div className={s.gTitle}>Caller cut me off mid-sentence.</div><div><span className={s.strike}>Fact lost.</span></div></>, back: <><div className={s.gTitle}>“Also, <span className={s.mark}>before I forget</span>…”</div><div className={s.statText}>Unsaid critical facts come back after the interruption.</div></> },
];

function Guards() {
  const [flip, setFlip] = useState<Set<number>>(new Set());
  return (
    <div className={s.guards}>
      {GUARDS.map((g, i) => (
        <button key={i} type="button" className={`${s.guard} ${flip.has(i) ? s.flipped : ""}`} aria-pressed={flip.has(i)}
          onClick={() => setFlip((f) => { const n = new Set(f); n.has(i) ? n.delete(i) : n.add(i); return n; })}>
          <div className={s.guardInner}>
            <div className={s.face} data-spot style={{ "--spot": "#ff6b6b" } as CSSProperties}>{g.front}<div className={s.flipHint}>what a chatbot says · tap to see ours →</div></div>
            <div className={`${s.face} ${s.back}`} data-spot style={{ "--spot": "#6fdc8c" } as CSSProperties}>{g.back}<div className={s.flipHint}>what Kaam Ki Baat says</div></div>
          </div>
        </button>
      ))}
    </div>
  );
}

const CODE = [
  "export async function persistVerifiedUpdate(args: {",
  "  raw: unknown;",
  "  trustedActorId: string | null;",
  "  callId?: string | null;",
  "  authorizedTaskIds: ReadonlySet<string>;",
  "  blockedTaskIds?: ReadonlyMap<string, string>; // taskId -> reason (e.g. disputed ownership)",
  "  repository: UpdateRepository;",
  "  generateId: () => string;",
  "  now?: () => string;",
  "  timeoutMs?: number;",
  "}): Promise<PersistResult> {",
  "  const parsed = parseTaskUpdate(args.raw);",
  "  if (!parsed.ok) return { saved: false, reason: `invalid or unconfirmed update: ${parsed.reason}` };",
  "  const req = parsed.value;",
  "  if (!args.trustedActorId || !args.authorizedTaskIds.has(req.taskId)) return { saved: false, reason: \"unauthorized\" };",
  "  const blocked = args.blockedTaskIds?.get(req.taskId);",
  "  if (blocked) return { saved: false, reason: blocked };",
];
const FIRST_LINE = 25; // real lines L25–L41 of lib/core/persist-update.ts @ 63317bd
const HOT = new Set([0, 14]); // the function, and the server-side identity check


function CodeNav() {
  const [ref, inView] = useInView<HTMLDivElement>(0.4);
  return (
    <div ref={ref} className={s.codeBox}>
      <div className={s.codeHead}>
        <span>harshsinha-12/kaam-ki-baat @ <b style={{ color: "var(--ink)" }}>63317bd</b> · lib/core/persist-update.ts</span>
        <span className={`${s.tag} ${s.tagOk}`}>confirmed · changed in PR #2</span>
      </div>
      <div className={s.codeBody}>
        {CODE.map((l, i) => (
          <div key={i} className={`${s.cl} ${inView && HOT.has(i) ? s.clHot : ""}`} style={{ "--i": i } as CSSProperties}>
            <span className={s.ln}>{FIRST_LINE + i}</span><span className={s.code}>{l || " "}</span>
          </div>
        ))}
      </div>
      <div className={s.codeHead} style={{ borderTop: "1px solid var(--line)", borderBottom: 0 }}>
        <span>next: npm test -- tests/persist-update.test.ts</span><a href={`${REPO}/blob/63317bd/lib/core/persist-update.ts#L25-L41`} target="_blank" rel="noreferrer">open at 63317bd ↗</a>
      </div>
    </div>
  );
}

function Architecture() {
  const col = (x: number, items: { t: string; m: string; c: string }[]) =>
    items.map((it, i) => (
      <g key={it.t}>
        <rect x={x} y={30 + i * 78} width="190" height="56" rx="12" className={s.archBox} stroke={it.c} strokeOpacity=".5" />
        <text x={x + 16} y={54 + i * 78} className={s.archText}>{it.t}</text>
        <text x={x + 16} y={72 + i * 78} className={s.archSub}>{it.m}</text>
      </g>
    ));
  return (
    <svg viewBox="0 0 1000 340" className={s.archSvg} role="img" aria-label="Sources flow into the evidence engine, which serves the three zones and the Bolna voice runtime">
      {[0, 1, 2, 3].map((i) => <path key={`a${i}`} d={`M220 ${58 + i * 78} C 300 ${58 + i * 78}, 320 170, 400 170`} className={s.flow} stroke="#5d5a52" />)}
      {[0, 1, 2, 3].map((i) => <path key={`b${i}`} d={`M600 170 C 680 170, 700 ${58 + i * 78}, 780 ${58 + i * 78}`} className={s.flow} stroke={["var(--left)", "var(--center)", "var(--right)", "#9a968c"][i]} />)}
      {col(30, [
        { t: "Wispr Flow MCP", m: "one approved meeting", c: "#b48cff" },
        { t: "GitHub", m: "one repo · SHA-pinned", c: "#9a968c" },
        { t: "Live app STT", m: "opt-in · provisional", c: "#7cc4ff" },
        { t: "Head turn / tap", m: "AirPods · webcam · keys", c: "#ff8a65" },
      ])}
      <rect x="400" y="96" width="200" height="148" rx="18" className={s.archBox} stroke="var(--ok)" strokeOpacity=".5" />
      <text x="500" y="140" textAnchor="middle" className={s.archText}>Evidence engine</text>
      <text x="500" y="162" textAnchor="middle" className={s.archSub}>roles · consent · reconcile</text>
      <text x="500" y="180" textAnchor="middle" className={s.archSub}>versioned memory</text>
      <text x="500" y="198" textAnchor="middle" className={s.archSub}>work + comms ledgers</text>
      {col(780, [
        { t: "Team Memory", m: "left · members", c: "#7cc4ff" },
        { t: "Leader Desk", m: "center · leader only", c: "#f5c451" },
        { t: "Code Navigator", m: "right · repo access", c: "#ff8a65" },
        { t: "Bolna voice", m: "phone · 5 HTTPS tools", c: "#9a968c" },
      ])}
    </svg>
  );
}

function GraphSection() {
  const reduced = useContext(ReducedMotion);
  const demos = graphDemo as { q: string; seed: { label: string; path: string; line: number } | null; nodes: string[]; explanation: string[] }[];
  const [i, setI] = useState(0);
  const [ref, inView] = useInView<HTMLDivElement>(0.25);
  const [manual, setManual] = useState(false);
  useEffect(() => { if (reduced || !inView || manual) return; const id = setInterval(() => setI((x) => (x + 1) % demos.length), 5200); return () => clearInterval(id); }, [inView, manual, demos.length, reduced]);
  const d = demos[i];
  const g = graphData as unknown as ViewGraph;
  return (
    <div ref={ref} className={s.graphBox}>
      <div className={s.graphCanvas}><CodeGraphView graph={g} highlight={inView ? d.nodes : []} height={480} /></div>
      <div className={s.graphSide}>
        <div className={s.chips}>{demos.map((x, k) => <button key={x.q} type="button" className={`${s.chip} ${k === i ? s.chipOn : ""}`} onClick={() => { setManual(true); setI(k); }}>{x.q}</button>)}</div>
        <div className={s.graphQ}>“{d.q}”</div>
        <ol className={s.graphSteps}>{d.explanation.map((l, k) => <li key={`${i}-${k}`} style={{ "--i": k } as CSSProperties}>{l.replace(/^\d+\.\s*/, "")}</li>)}</ol>
        <div className={s.cite}>FIXTURE · static graph preview · {g.nodes.length} nodes · {g.edges.length} edges · selected files from {g.repository} @ {g.sha.slice(0, 7)}. This built-in preview is separate from optional Graphify retrieval.</div>
      </div>
    </div>
  );
}

const HEARD_SAMPLE = "umm, code freeze 3:30, nahi matlab, final time kab hai?";
const HEARS = [
  { k: "HEARD", t: "Wispr hears it", b: "Meeting notes come from Wispr Flow, and live speech from an app you opt into. Fillers and “no, sorry” self-corrections are cleaned up.",
    ui: "heard" },
  { k: "UNDERSTOOD", t: "It works out what you mean", b: "“Freeze kab hai” becomes the open freeze decision. “Woh code” becomes the function you were just talking about.", ui: "mean" },
  { k: "DECIDED", t: "The evidence decides", b: "Fixed rules check the source: who said it, whether it was proposed or approved, and whether the PR is open or merged.", ui: "decide" },
  { k: "ANSWERED", t: "An agent answers, with the line", b: "One short sentence in Hindi or English, spoken by Bolna. The cited passage or code line opens on screen.", ui: "answer" },
];

function HearsUI({ ui, on }: { ui: string; on: boolean }) {
  const reduced = useContext(ReducedMotion);
  if (ui === "heard") {
    const u = understand(HEARD_SAMPLE);
    return (
      <div className={`${s.hUi} ${s.hDark}`}>
        <div className={s.hTop}><span className={s.live}>● LISTENING</span><span className={s.tagPill}>EN</span><span className={s.tagPill}>हिं</span><span className={`${s.tagPill} ${s.tagHot}`}>Hinglish</span></div>
        <div className={s.wave} aria-hidden>{Array.from({ length: 14 }, (_, i) => <i key={i} style={{ "--i": i } as CSSProperties} className={on ? s.waveOn : ""} />)}</div>
        <div className={s.hText}>{u.heard}</div>
        <div className={s.editTags}>{u.edits.map((e, i) => <span key={i} className={s.editTag} style={{ "--i": i } as CSSProperties}>{e.kind === "filler" ? `filler · ${e.text}` : e.kind === "correction" ? `correction · ${e.text.replace(/^umm,?\s*/i, "")}` : e.kind}</span>)}</div>
        <div className={s.hChip}>{u.cleaned}</div>
      </div>
    );
  }
  if (ui === "mean") return (
    <div className={`${s.hUi} ${s.hDashed}`}>
      {[["freeze kab hai", "dec:t_freeze"], ["woh code", "persistVerifiedUpdate()"], ["mera kaam", "Harsh · 3 calls"], ["ho gaya?", "PR #11 · merged"]].map(([a, b], i) => (
        <div key={a} className={s.mapRow} style={{ "--i": i } as CSSProperties}><span className={s.mapFrom}>{a}</span><span className={s.mapArrow}>→</span><span className={s.mapTo}>{b}</span></div>
      ))}
    </div>
  );
  if (ui === "decide") return (
    <div className={`${s.hUi} ${s.hPaper}`}>
      <div className={s.docLine}><b>Freeze</b> <span className={s.strike}>3:30</span> → <span className={s.markAmber}>unknown</span></div>
      {["said by Harsh, a question, not a decision", "no owner, so it isn't approved", "escalate to the leader, don't guess"].map((t, i) => (
        <div key={t} className={s.check} style={{ "--i": i } as CSSProperties}><span className={i === 2 ? s.dotAmber : s.dotOk} />{t}</div>
      ))}
    </div>
  );
  return (
    <div className={`${s.hUi} ${s.hPaper}`}>
      <div className={s.hTop}><AgentGlyph zone="team_memory" size={22} active reduced={reduced} /><span style={{ fontWeight: 600 }}>Team Memory</span></div>
      <div className={s.bubble}>Freeze abhi decide nahi hua. Main Charan se puchhun?</div>
      <div className={s.meta}>meeting kkb-sync · Harsh · passage 11</div>
    </div>
  );
}

function Hears() {
  const reduced = useContext(ReducedMotion);
  const [ref, inView] = useInView<HTMLDivElement>(0.3);
  const [i, setI] = useState(0);
  const [manual, setManual] = useState(false);
  useEffect(() => { if (reduced || !inView || manual) return; const id = setInterval(() => setI((x) => (x + 1) % HEARS.length), 2600); return () => clearInterval(id); }, [inView, manual, reduced]);
  return (
    <div ref={ref} className={s.hears}>
      <div className={s.rail} aria-hidden>
        <div className={s.railFill} style={{ width: `${(i / (HEARS.length - 1)) * 100}%` }} />
        <div className={s.railDot} style={{ left: `${(i / (HEARS.length - 1)) * 100}%` }} />
        {HEARS.map((h, k) => <span key={h.k} className={s.railLabel} style={{ left: `${(k / (HEARS.length - 1)) * 100}%` }}>{h.k}</span>)}
      </div>
      <div className={s.hGrid}>
        {HEARS.map((h, k) => (
          <button key={h.k} type="button" className={`${s.hCol} ${k === i ? s.hOn : ""}`} onClick={() => { setManual(true); setI(k); }}>
            <div data-spot style={{ borderRadius: 18, "--spot": ["#b48cff", "#f5c451", "#6fdc8c", "#7cc4ff"][k] } as CSSProperties}><HearsUI ui={h.ui} on={k === i} /></div>
            <div className={s.hNum}>0{k + 1}</div>
            <div className={s.hTitle}>{h.t}</div>
            <div className={s.hBody}>{h.b}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function BrandMark() {
  return (
    <svg width="26" height="26" viewBox="0 0 64 64" aria-hidden>
      <defs><linearGradient id="kkbBrand" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#7cc4ff" /><stop offset=".5" stopColor="#f5c451" /><stop offset="1" stopColor="#ff8a65" /></linearGradient></defs>
      <rect width="64" height="64" rx="15" fill="#171715" />
      <path d="M32 9 L52 20.5 V43.5 L32 55 L12 43.5 V20.5 Z" fill="url(#kkbBrand)" />
      <ellipse cx="25" cy="31" rx="3.2" ry="4.4" fill="#0b0b0c" /><ellipse cx="39" cy="31" rx="3.2" ry="4.4" fill="#0b0b0c" />
      <path d="M24 41 q8 5 16 0" stroke="#0b0b0c" strokeWidth="2.6" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/* ------------------------------------------------------------------ page */
function useSpotlight() {
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest?.("[data-spot]") as HTMLElement | null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${e.clientX - r.left}px`);
      el.style.setProperty("--my", `${e.clientY - r.top}px`);
    };
    document.addEventListener("pointermove", move, { passive: true });
    return () => document.removeEventListener("pointermove", move);
  }, []);
}

export default function Landing() {
  useSpotlight();
  const reduced = useMotionPreference();
  const [scrolled, setScrolled] = useState(false);
  const onScroll = useCallback(() => setScrolled(window.scrollY > 8), []);
  useEffect(() => { window.addEventListener("scroll", onScroll, { passive: true }); return () => window.removeEventListener("scroll", onScroll); }, [onScroll]);

  return (
    <ReducedMotion.Provider value={reduced}><div className={s.page} data-reduced-motion={reduced}>
      <a href="#main" className={s.skip}>Skip to content</a>
      <nav className={s.nav} style={{ boxShadow: scrolled ? "0 10px 30px -20px #000" : "none" }}>
        <a href="#" className={s.brand}><BrandMark />Kaam Ki Baat</a>
        <div className={s.navLinks}>
          <a href="#problem">Problem</a><a href="#hears">How it hears</a><a href="#zones">Three zones</a><a href="#escalation">Escalation</a><a href="#guards">Guards</a><a href="#graph">Code graph</a><a href="#how">How it works</a>
        </div>
        <a href="/team" className={`${s.btn} ${s.primary}`}>Open workspace →</a>
      </nav>

      <main id="main">
        <header className={s.hero}>
          <div className={s.glow} aria-hidden />
          <div>
            <span className={s.pill}><span className={s.dotLive} />Voice teammate for engineering teams</span>
            <h1 className={s.h1}>
              <span className={s.line}><span>Meeting mein bola.</span></span>
              <span className={s.line}><span><em>Repo mein bana?</em></span></span>
            </h1>
            <p className={s.heroSub}>
              Look left to ask what the team decided. Face front to ask the leader. Look right to land on the exact line of code. Every answer has a source; every "saved" has been read back.
            </p>
            <div className={s.ctaRow}>
              <a href="#zones" className={`${s.btn} ${s.primary}`}>See how it thinks ↓</a>
              <a href={REPO} className={s.btn} target="_blank" rel="noreferrer">GitHub</a>
            </div>
            <div className={s.kbdHint}>AirPods head motion · Webcam tracking · Keyboard + tap<br />Try the preview: focus the stage and press <span className={s.kbd}>←</span><span className={s.kbd}>↑</span><span className={s.kbd}>→</span>, or click a zone.</div>
          </div>
          <HeroStage />
        </header>

        <section id="problem" className={s.section}>
          <Reveal><div className={s.eyebrow}>The cost of “wait, what did we decide?”</div></Reveal>
          <Reveal i={1}><h2 className={s.h2}>Meetings end. <em>Doubt</em> doesn't.</h2></Reveal>
          <Stats />
        </section>

        <section className={s.section}><DoubtLoop /></section>

        <section id="hears" className={s.section}>
          <Reveal><div className={s.eyebrow}>From speech to a checked answer</div></Reveal>
          <Reveal i={1}><h2 className={s.h2}>Wispr hears it. <em>The evidence</em> decides it.</h2></Reveal>
          <Hears />
        </section>

        <section id="zones" className={s.section}>
          <Reveal><div className={s.eyebrow}>Three agents, one voice</div></Reveal>
          <Reveal i={1}><h2 className={s.h2}>Where you look decides <em>who</em> answers.</h2></Reveal>
          <Reveal i={2}><p className={s.lede}>Choose your workspace with AirPods head motion, webcam tracking, or keyboard and tap controls. Calibrate facing forward, then turn left, center, or right to select an agent. You still choose when to talk.</p></Reveal>
          <ZonesDive />
        </section>

        <section id="escalation" className={s.section}>
          <Reveal><div className={s.eyebrow}>The defining loop</div></Reveal>
          <Reveal i={1}><h2 className={s.h2}>From <em>“not sure”</em> to a sourced answer.</h2></Reveal>
          <Reveal i={2}><p className={s.lede}>Unknowns turn into leader tickets instead of guesses. The answer comes back with provenance, even if you hung up in the meantime.</p></Reveal>
          <Escalation />
        </section>

        <section id="guards" className={s.section}>
          <Reveal><div className={s.eyebrow}>What it refuses to fake</div></Reveal>
          <Reveal i={1}><h2 className={s.h2}>Confident is easy. <em>Correct</em> is the product.</h2></Reveal>
          <Guards />
        </section>

        <section className={s.section}>
          <Reveal><div className={s.eyebrow}>Look right</div></Reveal>
          <Reveal i={1}><h2 className={s.h2}>The answer to “kahan hai?” is a <em>line number</em>.</h2></Reveal>
          <CodeNav />
        </section>

        <section id="graph" className={s.section}>
          <Reveal><div className={s.eyebrow}>The codebase, as a graph</div></Reveal>
          <Reveal i={1}><h2 className={s.h2}>Find a function. <em>Follow the links</em>.</h2></Reveal>
          <Reveal i={2}><p className={s.lede}>Selected files and symbols form a static graph. Text matching finds a candidate, then import and call hints connect nearby code and tests. These links help navigation; they do not prove runtime behavior or test coverage.</p></Reveal>
          <GraphSection />
        </section>

        <section id="how" className={s.section}>
          <Reveal><div className={s.eyebrow}>How it works</div></Reveal>
          <Reveal i={1}><h2 className={s.h2}>Sources in. <em>Evidence</em> out.</h2></Reveal>
          <Reveal i={2}><p className={s.lede}>The Wispr MCP supplies reviewed meeting passages from one approved meeting. GitHub supplies SHA-pinned code. AirPods and webcam head motion select your zone; a click or keypress activates it. Live speech stays provisional. Fixed rules decide status; the language model only explains.</p></Reveal>
          <Architecture />
          <div className={s.statusGrid}>
            <div className={s.statusCol}><h3>Works now</h3><ul>
              <li>Evidence engine, three zones, leader escalation with read-back</li>
              <li>Live GitHub reads: PRs, changed files, check runs</li>
              <li>Bolna runtime tools (HTTPS), tested locally with fixtures</li>
              <li>AirPods motion companion + webcam controls, with calibration and dwell</li>
            </ul></div>
            <div className={s.statusCol}><h3>Next</h3><ul>
              <li>Verify the configured voice path in a real call</li>
              <li>Three consented phone calls &gt; 45 s</li>
              <li>Real-device passkey validation</li>
              <li>Optional Supabase realtime, once tests match</li>
            </ul></div>
          </div>
        </section>

        <section className={`${s.section} ${s.final}`}>
          <Reveal><h2 className={s.h2}>Stop guessing what the team <em>meant</em>.</h2></Reveal>
          <Reveal i={1}><div className={s.ctaRow} style={{ justifyContent: "center", opacity: 1, animation: "none" }}>
            <a href="/board" className={`${s.btn} ${s.primary}`}>Open the workspace</a>
            <a href={`${REPO}/blob/main/docs/architecture.md`} className={s.btn} target="_blank" rel="noreferrer">Read the architecture</a>
          </div></Reveal>
        </section>
      </main>

      <footer className={s.footer}>
        <span>Kaam Ki Baat · built at a 3-hour hackathon with Wispr Flow, Bolna and GitHub.</span>
        <span>Demo conversations on this page are fictional.</span>
      </footer>
    </div></ReducedMotion.Provider>
  );
}
