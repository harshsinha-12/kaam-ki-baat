"use client";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import s from "./landing.module.css";
import graphData from "../../data/demo/codegraph.json";
import { AgentGlyph } from "../components/AgentGlyph";
import { VoiceWave } from "../components/VoiceWave";
import { DemoGraph } from "../components/DemoGraph";
import { arcLength, catmullRomToBezier, damp, toSvgPath, type V2 } from "../../lib/motion/curves";
import { understand } from "../../lib/core/understand";

// Kaam Ki Baat landing. The page explains the product by doing it: look left
// for Team Memory, face front for the Leader Desk, look right for the Code
// Navigator. No motion libraries: CSS, SVG and requestAnimationFrame only.
// Everything settles to a static layout when prefers-reduced-motion is set.

type Zone = "team_memory" | "leader_desk" | "code_navigator";
const ZONES: Zone[] = ["team_memory", "leader_desk", "code_navigator"];
const REPO = "https://github.com/harshsinha-12/kaam-ki-baat";
const ReducedMotion = createContext(true);

// Muted accents. Colour marks which agent is speaking; it never decorates.
const ZONE_HEX: Record<Zone, string> = { team_memory: "#8db8e8", leader_desk: "#e2bf72", code_navigator: "#e39478" };

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

function useCountUp(target: number, run: boolean, ms = 1400) {
  const reduced = useContext(ReducedMotion);
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!run || reduced) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      setV(Math.round(target * (1 - Math.pow(1 - p, 4))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, run, ms, reduced]);
  return reduced ? target : v;
}

const typingTarget = (el: EventTarget | null) => !!(el as HTMLElement | null)?.closest?.("input, textarea, select, [contenteditable=true]");

/* ------------------------------------------------------- the listener */
// You, seen from the front, wearing AirPods. The head turns toward the agent
// you picked and the AirPods pick up that agent's colour.
const TURN: Record<Zone, number> = { team_memory: -26, leader_desk: 0, code_navigator: 26 };
function Listener({ zone, speaking }: { zone: Zone; speaking: boolean }) {
  const reduced = useContext(ReducedMotion);
  const color = ZONE_HEX[zone];
  const look = zone === "team_memory" ? -1 : zone === "code_navigator" ? 1 : 0;
  const anim = !reduced;
  return (
    <div className={s.listener} aria-hidden>
      <div className={s.listenerHead} style={{ transform: `perspective(520px) rotateY(${TURN[zone]}deg) rotateX(${zone === "leader_desk" ? -6 : 0}deg)` }}>
        <svg viewBox="0 0 140 150" width="100%" height="100%">
          <defs>
            <radialGradient id="kkbSkin" cx="42%" cy="30%" r="78%"><stop offset="0" stopColor="#e2b089" /><stop offset=".65" stopColor="#c48a63" /><stop offset="1" stopColor="#9a6545" /></radialGradient>
            <linearGradient id="kkbHair" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2e221c" /><stop offset="1" stopColor="#16110e" /></linearGradient>
            <linearGradient id="kkbTop" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2a2a2a" /><stop offset="1" stopColor="#141414" /></linearGradient>
          </defs>
          <g>
            {anim && <animateTransform attributeName="transform" type="translate" values="0 0;0 -1.2;0 0" dur="4.2s" repeatCount="indefinite" />}
            <path d="M12 150 C16 121 41 108 70 108 C99 108 124 121 128 150 Z" fill="url(#kkbTop)" />
            <path d="M52 110 C58 123 82 123 88 110" fill="none" stroke="#3a3a3a" strokeWidth="2" />
            <path d="M63 118 v13 M77 118 v13" stroke="#bdbdbd" strokeWidth="1.8" strokeLinecap="round" />
            <rect x="58" y="88" width="24" height="24" rx="10" fill="#b37b55" />
            <ellipse cx="70" cy="60" rx="33" ry="38" fill="url(#kkbSkin)" />
            <path d="M36 58 C34 27 55 15 72 16 C93 17 107 32 104 60 C100 45 90 37 78 35 C63 33 46 40 36 58 Z" fill="url(#kkbHair)" />
            <g style={{ transform: `translateX(${look * 6}px)`, transition: reduced ? "none" : "transform .8s cubic-bezier(.16,1,.3,1)" }}>
              <path d="M51 51 q6 -3.4 11 0 M78 51 q6 -3.4 11 0" stroke="#2e221c" strokeWidth="2.2" fill="none" strokeLinecap="round" />
              {[57, 83].map((x) => (
                <g key={x}>
                  <ellipse cx={x} cy="61" rx="4.4" ry="4.6" fill="#fbf8f3" />
                  <circle cx={x + look * 1.4} cy="61.4" r="2.8" fill="#2a1d17" />
                  <circle cx={x + look * 1.4 + 0.9} cy="60.3" r=".9" fill="#fff" />
                  <rect x={x - 5} y="55" width="10" height="0" fill="#c48a63">
                    {anim && <animate attributeName="height" values="0;0;12;0" keyTimes="0;.94;.97;1" dur="4.6s" repeatCount="indefinite" />}
                  </rect>
                </g>
              ))}
              <path d="M70 64 q-2.4 7 1.4 8.4" stroke="#996244" strokeWidth="1.8" fill="none" strokeLinecap="round" />
              <ellipse cx="71" cy="82" rx="6" ry="2" fill="#7a3f30">
                {anim && speaking && <animate attributeName="ry" values="1.5;3.4;1.2;3;1.5" dur=".7s" repeatCount="indefinite" />}
              </ellipse>
            </g>
            {[[36, 64], [104, 64]].map(([x, y]) => (
              <g key={x}>
                <circle cx={x} cy={y} r="8.5" fill={color} opacity=".18" style={{ transition: "fill .5s" }} />
                <rect x={x - 3.6} y={y - 6} width="7.2" height="11" rx="3.6" fill="#f7f7f5" />
                <rect x={x - 1.4} y={y + 3} width="2.8" height="9" rx="1.4" fill="#f7f7f5" />
              </g>
            ))}
          </g>
        </svg>
      </div>
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
          <p>{asking && !reduced ? <span className={s.typingWave}><VoiceWave active color="#d9d9d9" bars={14} height={14} reduced={reduced} /></span> : null}“{script.ask}”</p>
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
      <article className={s.stat}>
        <span className={s.statTag}>Unclear after meetings</span>
        <div className={s.big}>{a}<span className={s.pct}>%</span></div>
        <div className={s.dots} aria-hidden>{Array.from({ length: 100 }, (_, i) => <span key={i} className={`${s.dot} ${i < (reduced ? 55 : lit) ? s.dotOn : ""}`} />)}</div>
        <p className={s.statText}>of people say <b>next steps are unclear</b> when a meeting ends.</p>
        <div className={s.cite}>Microsoft Work Trend Index 2023 · <a href="https://www.microsoft.com/en-us/worklab/work-trend-index/will-ai-fix-work" target="_blank" rel="noreferrer">source</a></div>
      </article>
      <article className={s.stat}>
        <span className={s.statTag}>Time lost</span>
        <div className={s.big}>{b}<span className={s.pct}>%</span></div>
        <div className={s.week} aria-hidden>{["Mon", "Tue", "Wed", "Thu", "Fri"].map((d, i) => (
          <div key={d} className={`${s.day} ${i === 4 && inView ? s.dayLost : ""}`}><span>{d}</span></div>
        ))}</div>
        <p className={s.statText}>of developers lose <b>8+ hours a week</b> to inefficiencies. That is a whole working day.</p>
        <div className={s.cite}>Atlassian and DX, State of DevEx 2024 · <a href="https://www.atlassian.com/blog/development/developer-experience-report-2024" target="_blank" rel="noreferrer">source</a></div>
      </article>
      <article className={s.stat}>
        <span className={s.statTag}>Waiting for answers</span>
        <div className={s.big}>{c}<span className={s.pct}>%</span></div>
        <svg className={s.clock} viewBox="0 0 120 120" aria-hidden>
          {Array.from({ length: 60 }, (_, i) => { const ang = (i / 60) * Math.PI * 2 - Math.PI / 2; const on = inView && i < 30;
            return <line key={i} x1={60 + 44 * Math.cos(ang)} y1={60 + 44 * Math.sin(ang)} x2={60 + (i % 5 ? 50 : 53) * Math.cos(ang)} y2={60 + (i % 5 ? 50 : 53) * Math.sin(ang)}
              stroke={on ? "#e5e5e5" : "#262626"} strokeWidth={i % 5 ? 2 : 3} strokeLinecap="round" style={{ transition: `stroke .3s ${i * 25}ms` }} />; })}
          <text x="60" y="58" textAnchor="middle" className={s.clockBig}>30+</text>
          <text x="60" y="74" textAnchor="middle" className={s.clockSmall}>min a day</text>
        </svg>
        <p className={s.statText}>of developers spend <b>30+ minutes a day</b> searching for answers.</p>
        <div className={s.cite}>Stack Overflow Developer Survey 2024 · <a href="https://survey.stackoverflow.co/2024/professional-developers" target="_blank" rel="noreferrer">source</a></div>
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
  const [sec, setSec] = useState(0);
  const [step, setStep] = useState(0);
  useEffect(() => { if (reduced) return; const id = setInterval(() => { setSec((x) => x + 1); }, 1000); return () => clearInterval(id); }, [reduced]);
  useEffect(() => { if (reduced) return; const id = setInterval(() => setStep((x) => (x + 1) % LOOP.length), 1800); return () => clearInterval(id); }, [reduced]);
  return (
    <div className={s.loopGrid}>
      <div>
        <Reveal><div className={s.eyebrow}>The doubt loop</div></Reveal>
        <Reveal i={1}><h2 className={s.h2}>Every team runs it. <em>Nobody</em> owns it.</h2></Reveal>
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

/* ------------------------------------------------------------- hearing */
const HEARD_SAMPLE = "umm, code freeze 3:30, nahi matlab, final time kab hai?";
const HEARS = [
  { k: "Heard", t: "Wispr hears it", b: "Meeting notes come from Wispr Flow, and live speech from an app you opt into. Fillers and self-corrections are cleaned up.", ui: "heard" },
  { k: "Understood", t: "It works out what you mean", b: "“Freeze kab hai” becomes the open freeze decision. “Woh code” becomes the function you were just talking about.", ui: "mean" },
  { k: "Decided", t: "The evidence decides", b: "Fixed rules check the source: who said it, whether it was proposed or approved, and whether the PR is open or merged.", ui: "decide" },
  { k: "Answered", t: "An agent answers, with the line", b: "One short sentence in Hindi or English, spoken by Bolna. The cited passage or code line opens on screen.", ui: "answer" },
];

function HearsUI({ ui, on }: { ui: string; on: boolean }) {
  const reduced = useContext(ReducedMotion);
  if (ui === "heard") {
    const u = understand(HEARD_SAMPLE);
    return (
      <div className={s.hUi}>
        <div className={s.hTop}><span className={s.live}><i />Listening</span><span className={s.chip}>EN</span><span className={s.chip}>हिं</span><span className={`${s.chip} ${s.chipOn}`}>Hinglish</span></div>
        <div className={s.wave} aria-hidden>{Array.from({ length: 18 }, (_, i) => <i key={i} style={{ "--i": i } as CSSProperties} className={on ? s.waveOn : ""} />)}</div>
        <div className={s.hText}>{u.heard}</div>
        <div className={s.editTags}>{u.edits.map((e, i) => <span key={i} className={s.editTag}>{e.kind === "filler" ? `filler: ${e.text}` : e.kind === "correction" ? `correction: ${e.text.replace(/^umm,?\s*/i, "")}` : e.kind}</span>)}</div>
        <div className={s.hClean}>{u.cleaned}</div>
      </div>
    );
  }
  if (ui === "mean") return (
    <div className={s.hUi}>
      {[["freeze kab hai", "decision: code freeze"], ["woh code", "persistVerifiedUpdate()"], ["mera kaam", "Harsh · 3 tasks"], ["ho gaya?", "PR #11 · merged"]].map(([a, b]) => (
        <div key={a} className={s.mapRow}><span className={s.mapFrom}>{a}</span><span className={s.mapArrow}>→</span><span className={s.mapTo}>{b}</span></div>
      ))}
    </div>
  );
  if (ui === "decide") return (
    <div className={s.hUi}>
      <div className={s.docLine}><b>Freeze</b> <span className={s.strike}>3:30</span> → <span className={s.unknown}>not decided</span></div>
      {["Said by Harsh, as a question", "No owner, so not approved", "Ask the lead instead of guessing"].map((t, i) => (
        <div key={t} className={s.check}><span className={i === 2 ? s.dotWait : s.dotOk} />{t}</div>
      ))}
    </div>
  );
  return (
    <div className={s.hUi}>
      <div className={s.hTop}><AgentGlyph zone="team_memory" size={20} active reduced={reduced} /><span style={{ fontWeight: 550 }}>Team Memory</span></div>
      <div className={s.bubble}>Freeze abhi decide nahi hua. Main Charan se puchhun?</div>
      <div className={s.hMeta}>Sprint sync · Harsh · passage 11</div>
    </div>
  );
}

function Hears() {
  const reduced = useContext(ReducedMotion);
  const [ref, inView] = useInView<HTMLDivElement>(0.3);
  const [i, setI] = useState(0);
  const [manual, setManual] = useState(false);
  useEffect(() => { if (reduced || !inView || manual) return; const id = setInterval(() => setI((x) => (x + 1) % HEARS.length), 2800); return () => clearInterval(id); }, [inView, manual, reduced]);
  return (
    <div ref={ref} className={s.hears}>
      <div className={s.hTabs} role="tablist">
        {HEARS.map((h, k) => (
          <button key={h.k} type="button" role="tab" aria-selected={k === i} className={s.hTab} onClick={() => { setManual(true); setI(k); }}>
            <span className={s.hNum}>0{k + 1}</span>{h.k}
          </button>
        ))}
      </div>
      <div className={s.hGrid}>
        {HEARS.map((h, k) => (
          <button key={h.k} type="button" className={`${s.hCol} ${k === i ? s.hOn : ""}`} onClick={() => { setManual(true); setI(k); }}>
            <HearsUI ui={h.ui} on={k === i} />
            <div className={s.hTitle}>{h.t}</div>
            <div className={s.hBody}>{h.b}</div>
          </button>
        ))}
      </div>
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
        <Reveal><div className={s.eyebrow}>For the lead</div></Reveal>
        <Reveal i={1}><h2 className={s.h2}>One desk to check that the whole team <em>got it</em>.</h2></Reveal>
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
                <span className={s.memberState}>{done ? (m.ok ? "Confirmed" : "Follow-up") : calling ? <span className={s.ring} /> : ""}</span>
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

/* ------------------------------------------------------------- escalation */
const PIPE = [
  { t: "Member asks", d: "“Code freeze kab hai?”", say: "Only proposed in the notes" },
  { t: "No verified answer", d: "It says so and offers to ask.", say: "A ticket goes to the lead" },
  { t: "Lead approves", d: "Verified role and a fresh passkey.", say: "Approved: 3:45 if CI is green" },
  { t: "Saved and read back", d: "Versioned and append-only.", say: "Decision v2, read back" },
  { t: "Answer delivered", d: "Now, or on the next call.", say: "“Approved by Charan”" },
];

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
      const pts: V2[] = [];
      badges.forEach((b, i) => { pts.push(b); if (i < badges.length - 1) pts.push({ x: (b.x + badges[i + 1].x) / 2, y: b.y - (i % 2 ? -14 : 14) }); });
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
      <path d={geo.d} fill="none" stroke="#2a2a2a" strokeWidth="1.5" strokeDasharray="4 6" />
      <path ref={trail} d={geo.d} fill="none" stroke="#d9d9d9" strokeWidth="1.5" strokeLinecap="round" style={{ strokeDasharray: total, strokeDashoffset: total }} />
      <circle ref={dot} r="5" fill="#fff" />
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
    const id = setInterval(() => setStep((x) => (x + 1) % PIPE.length), 1800);
    return () => clearInterval(id);
  }, [inView, manual, reduced]);
  return (
    <div ref={ref} className={s.pipe}>
      <SplinePacket container={ref} step={step} count={PIPE.length} />
      {PIPE.map((p, i) => (
        <button key={p.t} type="button" className={`${s.pStep} ${i <= step ? s.pOn : ""}`} onClick={() => { setManual(true); setStep(i); }}>
          <span className={s.pBadge} data-badge>{i + 1}</span>
          <span className={s.pTitle}>{p.t}</span>
          <span className={s.pText}>{p.d}</span>
          <span className={s.pSay}>{p.say}</span>
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------- guards */
const GUARDS: { front: ReactNode; back: ReactNode }[] = [
  { front: <><div className={s.gTitle}>“Is it merged?”</div><div className={s.strike}>Yes, the PR is done.</div></>, back: <><div className={s.gTitle}>PR #2 is open, not merged.</div><p className={s.gText}>An open PR is never reported as shipped.</p></> },
  { front: <><div className={s.gTitle}>“Did CI pass?”</div><div className={s.strike}>Yes, all green.</div></>, back: <><div className={s.gTitle}>Green on a1b2c3d, an older commit.</div><p className={s.gText}>A pass on an older commit does not verify the current one.</p></> },
  { front: <><div className={s.gTitle}>“Am I the owner?”</div><div className={s.strike}>Yes, you were assigned.</div></>, back: <><div className={s.gTitle}>Only proposed so far.</div><p className={s.gText}>Mentioned, assigned and accepted are different. It offers to ask the lead.</p></> },
  { front: <><div className={s.gTitle}>“Mark it done.”</div><div><span className={s.strike}>Saved!</span> <span className={s.gNote}>(it timed out)</span></div></>, back: <><div className={s.gTitle}>Saved only after read-back.</div><p className={s.gText}>A timeout is a failure, and it says so out loud.</p></> },
  { front: <><div className={s.gTitle}>“I turned to the leader zone.”</div><div className={s.strike}>Welcome, leader.</div></>, back: <><div className={s.gTitle}>A head turn only selects.</div><p className={s.gText}>Identity is a server-side role plus a passkey. Movement never unlocks anything.</p></> },
  { front: <><div className={s.gTitle}>Cut off mid-sentence.</div><div className={s.strike}>Fact lost.</div></>, back: <><div className={s.gTitle}>“Also, before I forget…”</div><p className={s.gText}>Unsaid critical facts come back after the interruption.</p></> },
];

function Guards() {
  const [flip, setFlip] = useState<Set<number>>(new Set());
  return (
    <div className={s.guards}>
      {GUARDS.map((g, i) => (
        <button key={i} type="button" className={`${s.guard} ${flip.has(i) ? s.flipped : ""}`} aria-pressed={flip.has(i)}
          onClick={() => setFlip((f) => { const n = new Set(f); if (n.has(i)) n.delete(i); else n.add(i); return n; })}>
          <span className={s.guardInner}>
            <span className={s.face}>{g.front}<span className={s.flipHint}>What a chatbot says. Tap to see ours</span></span>
            <span className={`${s.face} ${s.back}`}>{g.back}<span className={s.flipHint}>What Kaam Ki Baat says</span></span>
          </span>
        </button>
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

function BrandMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <rect width="64" height="64" rx="16" fill="#e2bf72" />
      <ellipse cx="25" cy="31" rx="3.6" ry="5" fill="#141414" /><ellipse cx="39" cy="31" rx="3.6" ry="5" fill="#141414" />
      <path d="M25 42 q7 4.5 14 0" stroke="#141414" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/* ------------------------------------------------------------- nav */
const NAV = [
  { id: "demo", label: "Demo" },
  { id: "problem", label: "Problem" },
  { id: "hears", label: "Hearing" },
  { id: "agents", label: "Agents" },
  { id: "leads", label: "For leads" },
  { id: "escalation", label: "Escalation" },
  { id: "guards", label: "Guards" },
  { id: "how", label: "Architecture" },
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
      <a href="#top" className={s.brand}><BrandMark />Kaam Ki Baat</a>
      <div ref={bar} className={s.navBar}>
        <span className={s.navPill} data-on={!!pill} style={pill ? { transform: `translateX(${pill.x}px)`, width: pill.w } : undefined} aria-hidden />
        {NAV.map((n) => <a key={n.id} href={`#${n.id}`} data-id={n.id} aria-current={active === n.id ? "true" : undefined}>{n.label}</a>)}
      </div>
      <div className={s.navCta}>
        <a href="/evals" className={`${s.btn} ${s.ghost}`}>Call evals</a>
        <a href="/team" className={`${s.btn} ${s.primary}`}>Open workspace</a>
      </div>
    </nav>
  );
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
            <span className={s.badge}><span className={s.dotLive} />Built at Build Out Loud · Wispr Flow × Bolna</span>
            <h1 className={s.h1}>
              <span className={s.line}><span>Meeting mein bola.</span></span>
              <span className={s.line}><span><em>Repo mein bana?</em></span></span>
            </h1>
            <p className={s.heroSub}>A voice teammate for engineering teams. Look left to ask what the team decided, face front to ask the lead, look right to land on the exact line of code. Every answer has a source.</p>
            <div className={s.ctaRow}>
              <a href="/team" className={`${s.btn} ${s.primary} ${s.big}`}>Open workspace</a>
              <a href="#demo" className={`${s.btn} ${s.big}`}>Watch it work</a>
            </div>
            <div className={s.inputs}>
              <span>Works with</span>
              <span className={s.inputChip}>AirPods head motion</span>
              <span className={s.inputChip}>Webcam</span>
              <span className={s.inputChip}>Keyboard <kbd className={s.kbd}>←</kbd><kbd className={s.kbd}>→</kbd></span>
            </div>
          </div>
          <div className={s.heroStage}><HeroConsole /></div>
        </header>

        <section id="demo" className={s.section}>
          <DemoGraph graph={graphData as never} />
        </section>

        <section id="problem" className={s.section}>
          <Reveal><div className={s.eyebrow}>The cost of “wait, what did we decide?”</div></Reveal>
          <Reveal i={1}><h2 className={s.h2}>Meetings end. <em>Doubt</em> doesn&apos;t.</h2></Reveal>
          <Stats />
        </section>

        <section className={s.section}><DoubtLoop /></section>

        <section id="hears" className={s.section}>
          <Reveal><div className={s.eyebrow}>From speech to a checked answer</div></Reveal>
          <Reveal i={1}><h2 className={s.h2}>Wispr hears it. <em>The evidence</em> decides it.</h2></Reveal>
          <Hears />
        </section>

        <section id="agents" className={s.section}>
          <Reveal><div className={s.eyebrow}>Three agents, one voice</div></Reveal>
          <Reveal i={1}><h2 className={s.h2}>Where you look decides <em>who</em> answers.</h2></Reveal>
          <Reveal i={2}><p className={s.lede}>Pick an agent with AirPods head motion, your webcam, or the arrow keys. Turn left, face front or turn right. You still choose when to talk.</p></Reveal>
          <AgentsDive />
        </section>

        <section id="leads" className={s.section}><LeadDesk /></section>

        <section id="escalation" className={s.section}>
          <Reveal><div className={s.eyebrow}>The defining loop</div></Reveal>
          <Reveal i={1}><h2 className={s.h2}>From <em>“not sure”</em> to a sourced answer.</h2></Reveal>
          <Reveal i={2}><p className={s.lede}>Unknowns turn into questions for the lead instead of guesses. The answer comes back with its source, even if you hung up in the meantime.</p></Reveal>
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

        <section id="how" className={s.section}>
          <Reveal><div className={s.eyebrow}>How it works</div></Reveal>
          <Reveal i={1}><h2 className={s.h2}>Sources in. <em>Evidence</em> out.</h2></Reveal>
          <Reveal i={2}><p className={s.lede}>Wispr supplies reviewed passages from one approved meeting. GitHub supplies commit-pinned code. Head motion selects an agent and a click or key press activates it. Fixed rules decide status; the language model only explains.</p></Reveal>
          <Architecture />
          <div className={s.statusGrid}>
            <div className={s.statusCol}><h3>Works now</h3><ul>
              <li>Evidence engine, three agents, leader escalation with read-back</li>
              <li>Live GitHub reads: PRs, changed files, check runs</li>
              <li>Bolna runtime tools over HTTPS, tested with fixtures</li>
              <li>AirPods motion companion and webcam controls with calibration</li>
            </ul></div>
            <div className={s.statusCol}><h3>Next</h3><ul>
              <li>Verify the voice path in a real call</li>
              <li>Three consented phone calls longer than 45 seconds</li>
              <li>Passkey checks on real devices</li>
              <li>Optional realtime sync once tests match</li>
            </ul></div>
          </div>
        </section>

        <section className={`${s.section} ${s.final}`}>
          <h2 className={s.finalH}>Stop guessing what the team <em>meant</em>.</h2>
          <div className={s.ctaRow} style={{ justifyContent: "center" }}>
            <a href="/team" className={`${s.btn} ${s.primary} ${s.big}`}>Open workspace</a>
            <a href={`${REPO}/blob/main/docs/architecture.md`} className={`${s.btn} ${s.big}`} target="_blank" rel="noreferrer">Read the architecture</a>
          </div>
        </section>
      </main>

      <footer className={s.footer}>
        <span className={s.footBrand}><BrandMark size={18} />Kaam Ki Baat</span>
        <span>Built in three hours at Build Out Loud with Wispr Flow, Bolna and GitHub. Demo conversations are fictional.</span>
        <a href={REPO} target="_blank" rel="noreferrer">GitHub ↗</a>
      </footer>
    </div></ReducedMotion.Provider>
  );
}
