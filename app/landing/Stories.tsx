"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent, type ReactNode } from "react";
import { understand } from "../../lib/core/understand";
import { arcLength, catmullRomToBezier, damp, toSvgPath, type V2 } from "../../lib/motion/curves";
import st from "./stories.module.css";

// Two story sections of the landing page, rebuilt as one object travelling
// through stages instead of five unrelated cards:
//   Hears      — the same spoken sentence is heard, understood, judged, answered.
//   Escalation — one doubt rides a relay across three lanes (member, Kaam Ki
//                Baat, lead) and comes back with its source.
// Colour is near-monochrome; one warm ivory marks "the thing being worked on".
// Motion is CSS + requestAnimationFrame; reduced motion shows settled states.

function useReduced() {
  const [r, set] = useState(true);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    const u = () => set(m.matches); u();
    m.addEventListener("change", u); return () => m.removeEventListener("change", u);
  }, []);
  return r;
}
function useInView<T extends Element>(threshold = 0.3) {
  const ref = useRef<T>(null);
  const [v, set] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el || !("IntersectionObserver" in window)) { set(true); return; }
    const io = new IntersectionObserver(([e]) => set(e.isIntersecting), { threshold });
    io.observe(el); return () => io.disconnect();
  }, [threshold]);
  return [ref, v] as const;
}
/** Pointer spotlight + a few degrees of tilt, written to CSS variables (no re-render). */
function spot(e: RPointerEvent<HTMLElement>) {
  const el = e.currentTarget, r = el.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
  el.style.setProperty("--mx", `${x * 100}%`); el.style.setProperty("--my", `${y * 100}%`);
  el.style.setProperty("--rx", `${(0.5 - y) * 3}deg`); el.style.setProperty("--ry", `${(x - 0.5) * 4}deg`);
}
const unspot = (e: RPointerEvent<HTMLElement>) => { e.currentTarget.style.setProperty("--rx", "0deg"); e.currentTarget.style.setProperty("--ry", "0deg"); };

/* =================================================================== HEARS */
const SAID = "umm, code freeze 3:30, nahi matlab, final time kab hai?";
type Part = { text: string; kind: "filler" | "dropped" | "kept" | "marker" };

function splitSaid(): { parts: Part[]; kept: string; topic: string } {
  const u = understand(SAID);
  const corr = u.edits.find((e) => e.kind === "correction");
  const kept = u.cleaned;
  // Rebuild the sentence as tagged runs so each run can animate on its own.
  const parts: Part[] = [
    { text: "umm,", kind: "filler" },
    { text: "code freeze 3:30,", kind: "dropped" },
    { text: "nahi matlab,", kind: "marker" },
    ...kept.split(" ").map((w): Part => ({ text: w, kind: "kept" })),
  ];
  return { parts, kept, topic: corr?.text.replace(/^umm,?\s*/i, "").replace(/\s*\d.*$/, "") || "code freeze" };
}

const STAGES = [
  { k: "Heard", t: "Wispr hears every word", b: "Fillers and the half you took back are struck, not guessed at.", token: "umm, code freeze 3:30, nahi…" },
  { k: "Understood", t: "It works out what you meant", b: "The words you kept, plus the topic you dropped, become one question.", token: "when? · code freeze" },
  { k: "Decided", t: "Evidence decides, not tone", b: "Fixed rules read the source: who said it, and whether anyone approved it.", token: "proposed, not approved" },
  { k: "Answered", t: "One sentence back, with the line", b: "Spoken by Bolna in the language you used. The cited passage opens on screen.", token: "“abhi decide nahi hua”" },
];

function Heard({ play }: { play: boolean }) {
  const { parts, kept } = useMemo(splitSaid, []);
  let w = 0;
  return (
    <div className={st.ui}>
      <div className={st.row}><span className={st.live} data-on={play}><i />Listening</span><span className={st.lang}>Hinglish</span></div>
      <Wave on={play} />
      <p className={st.said} aria-label={SAID}>
        {parts.map((p, i) => (
          <span key={i} className={st.run} data-kind={p.kind}>
            {p.text.split(" ").map((word, j) => <span key={j} className={st.word} style={{ "--w": w++ } as CSSProperties}>{word} </span>)}
          </span>
        ))}
      </p>
      <div className={st.keep}>
        <span className={st.keepLabel}>kept</span>
        <span className={st.keepChip}>{kept}</span>
      </div>
    </div>
  );
}

function Wave({ on }: { on: boolean }) {
  const path = useRef<SVGPathElement>(null);
  const reduced = useReduced();
  useEffect(() => {
    const el = path.current; if (!el) return;
    const draw = (t: number, amp: number) => {
      let d = "";
      for (let x = 0; x <= 200; x += 4) {
        const env = Math.sin((x / 200) * Math.PI);
        const y = 14 + env * amp * (Math.sin(x * 0.11 + t * 6) * 0.6 + Math.sin(x * 0.27 - t * 9) * 0.3 + Math.sin(x * 0.05 + t * 2) * 0.4);
        d += `${x ? "L" : "M"}${x} ${y.toFixed(2)}`;
      }
      el.setAttribute("d", d);
    };
    if (!on || reduced) { draw(0.4, on ? 6 : 1.2); return; }
    let raf = 0; const t0 = performance.now();
    const f = (now: number) => { const t = (now - t0) / 1000; draw(t, 7 + Math.sin(t * 2.3) * 3); raf = requestAnimationFrame(f); };
    raf = requestAnimationFrame(f); return () => cancelAnimationFrame(raf);
  }, [on, reduced]);
  return <svg className={st.wave} viewBox="0 0 200 28" preserveAspectRatio="none" aria-hidden><path ref={path} /></svg>;
}

function Understood() {
  const { kept, topic } = useMemo(splitSaid, []);
  const rows: [ReactNode, string, string][] = [
    [<><u>kab</u> hai</>, "asks", "when"],
    [<><u>final</u> time</>, "wants", "a confirmed time"],
    [<s>{topic}</s>, "about", `decision · ${topic}`],
  ];
  return (
    <div className={st.ui}>
      <span className={st.keepChip} data-small>{kept}</span>
      <ul className={st.map}>
        {rows.map(([from, verb, to], i) => (
          <li key={i} style={{ "--i": i } as CSSProperties}>
            <span className={st.mFrom}>{from}</span>
            <span className={st.mLine} aria-hidden />
            <span className={st.mTo}><small>{verb}</small>{to}</span>
          </li>
        ))}
      </ul>
      <div className={st.route}><span>Routed to</span><b>Team Memory</b><em>intent · memory</em></div>
    </div>
  );
}

function Decided() {
  const rows = [
    { k: "Said by", v: "Harsh, as a question", ok: false },
    { k: "Owner", v: "none recorded", ok: false },
    { k: "Approved", v: "no lead approval", ok: false },
  ];
  return (
    <div className={st.ui}>
      <div className={st.claim}><span>Notes say freeze at</span><b>3:30</b><span className={st.claimSrc}>passage 11</span></div>
      <ul className={st.ledger}>
        {rows.map((r, i) => (
          <li key={r.k} style={{ "--i": i } as CSSProperties}>
            <svg viewBox="0 0 16 16" aria-hidden><circle cx="8" cy="8" r="6.5" /><path d="M5.5 8h5" /></svg>
            <span>{r.k}</span><b>{r.v}</b>
          </li>
        ))}
      </ul>
      <div className={st.stamp}><span>Not decided</span><small>proposed ≠ decided</small></div>
    </div>
  );
}

const REPLY = "Freeze abhi decide nahi hua. Main Charan se puchhun?";
function Answered() {
  return (
    <div className={st.ui}>
      <div className={st.row}><span className={st.agent}><i />Team Memory</span><span className={st.voice} aria-hidden>{[0, 1, 2, 3, 4].map((i) => <i key={i} style={{ "--i": i } as CSSProperties} />)}</span></div>
      <p className={st.reply}>{REPLY.split(" ").map((w, i) => <span key={i} style={{ "--w": i } as CSSProperties}>{w} </span>)}</p>
      <div className={st.cite}><span>Sprint sync</span><span>Harsh</span><span>passage 11</span></div>
      <div className={st.choices}><span>Haan, puchho</span><span>Rehne do</span></div>
    </div>
  );
}

export function Hears() {
  const reduced = useReduced();
  const [ref, inView] = useInView<HTMLDivElement>(0.3);
  const [i, setI] = useState(0);
  const [cycle, setCycle] = useState(0);
  const [hold, setHold] = useState(false);
  useEffect(() => {
    if (reduced || !inView || hold) return;
    const id = setTimeout(() => { setI((x) => (x + 1) % STAGES.length); setCycle((c) => c + 1); }, i === 0 ? 4200 : 3400);
    return () => clearTimeout(id);
  }, [i, inView, hold, reduced]);
  const pick = (k: number) => { setI(k); setCycle((c) => c + 1); };
  // Replay the current stage from its first frame whenever the section scrolls into view.
  useEffect(() => { if (inView) setCycle((c) => c + 1); }, [inView]);
  return (
    <div ref={ref} className={st.hears} style={{ "--at": i } as CSSProperties} onPointerEnter={() => setHold(true)} onPointerLeave={() => setHold(false)}>
      <div className={st.rail} aria-hidden>
        <i className={st.railFill} />
        <span className={st.token} key={i}>{STAGES[i].token}</span>
      </div>
      {STAGES.map((s, k) => {
        const state = k === i ? "on" : k < i ? "done" : "next";
        return (
          <button key={s.k} type="button" className={st.card} data-state={state} data-play={k === i && !reduced} aria-pressed={k === i}
            onClick={() => pick(k)} onFocus={() => pick(k)} onPointerMove={spot} onPointerLeave={unspot}>
            <span className={st.head}><span className={st.num}>{String(k + 1).padStart(2, "0")}</span><span className={st.kick}>{s.k}</span></span>
            <span className={st.stage} key={k === i ? cycle : "settled"} data-settled={k !== i || reduced}>
              {k === 0 ? <Heard play={k === i && !reduced} /> : k === 1 ? <Understood /> : k === 2 ? <Decided /> : <Answered />}
            </span>
            <span className={st.title}>{s.t}</span>
            <span className={st.body}>{s.b}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ============================================================== ESCALATION */
type Lane = 0 | 1 | 2; // member, kaam ki baat, lead
const LANES = ["Member", "Kaam Ki Baat", "Lead"];
const RELAY: { lane: Lane; t: string; d: string; status: string; log: string }[] = [
  { lane: 0, t: "Member asks", d: "“Code freeze kab hai?”", status: "Asked", log: "Harsh asks on a call" },
  { lane: 1, t: "No verified answer", d: "Only proposed in the notes. It offers to ask.", status: "Unverified", log: "notes say 3:30, proposed only · ticket opened" },
  { lane: 2, t: "Lead approves", d: "Verified role and a fresh passkey.", status: "Approved", log: "Charan · passkey ✓ · 3:45 if CI is green" },
  { lane: 1, t: "Saved and read back", d: "Versioned, append-only, read back.", status: "Saved v2", log: "decision v2 written · read back ✓" },
  { lane: 0, t: "Answer delivered", d: "Now, or on the next call.", status: "Delivered", log: "" },
];
const VX = [60, 285, 500, 715, 940], VY = [50, 150, 250]; // viewBox 1000 × 300

export function Escalation() {
  const reduced = useReduced();
  const [ref, inView] = useInView<HTMLDivElement>(0.35);
  const [step, setStep] = useState(0);
  const [hold, setHold] = useState(false);
  const [hungUp, setHungUp] = useState(true);
  const track = useRef<HTMLDivElement>(null);
  const dot = useRef<HTMLSpanElement>(null);
  const trail = useRef<SVGPathElement>(null);
  // Geometry in real pixels of the track, so dashes and the moving ring stay true.
  const [size, setSize] = useState({ w: 1000, h: 300 });
  useEffect(() => {
    const el = track.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.max(200, e.contentRect.width), h: Math.max(120, e.contentRect.height) }));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  const pts: V2[] = useMemo(() => RELAY.map((r, i) => ({ x: (VX[i] / 1000) * size.w, y: (VY[r.lane] / 300) * size.h })), [size]);
  // Shoulders either side of each station keep the curve level as it passes through.
  const guide: V2[] = useMemo(() => { const sh = size.w * 0.034; return pts.flatMap((p, i) => [...(i ? [{ x: p.x - sh, y: p.y }] : []), p, ...(i < pts.length - 1 ? [{ x: p.x + sh, y: p.y }] : [])]); }, [pts, size.w]);
  const segs = useMemo(() => catmullRomToBezier(guide), [guide]);
  const curve = useMemo(() => arcLength(segs, 64), [segs]);
  const d = useMemo(() => toSvgPath(segs), [segs]);
  // station u-positions along the curve, so the ring stops exactly on a station
  const stops = useMemo(() => pts.map((p) => {
    let best = 0, bd = Infinity;
    for (let k = 0; k <= 600; k++) { const q = curve.at(k / 600); const dd = Math.hypot(q.x - p.x, q.y - p.y); if (dd < bd) { bd = dd; best = k / 600; } }
    return best;
  }), [pts, curve]);

  useEffect(() => {
    if (reduced || !inView || hold) return;
    const id = setTimeout(() => setStep((x) => (x + 1) % RELAY.length), step === RELAY.length - 1 ? 3400 : 2200);
    return () => clearTimeout(id);
  }, [step, inView, hold, reduced]);

  // Move the ticket along the curve with frame-rate independent damping.
  const u = useRef(0);
  useEffect(() => {
    const target = stops[step];
    let raf = 0, last = performance.now();
    const paint = () => {
      const p = curve.at(u.current);
      if (dot.current) dot.current.style.transform = `translate(${p.x}px, ${p.y}px)`;
      if (trail.current) trail.current.style.strokeDashoffset = String(curve.total * (1 - u.current));
    };
    if (reduced) { u.current = target; paint(); return; }
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      u.current = Math.abs(target - u.current) > 0.5 ? target : damp(u.current, target, 4.2, dt);
      paint();
      if (Math.abs(u.current - target) > 0.0008) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame); return () => cancelAnimationFrame(raf);
  }, [step, stops, curve, reduced]);
  // keep the ring and trail in place when only the size changed


  // Drag along the track to scrub: nearest station wins.
  const scrub = useCallback((clientX: number) => {
    const r = track.current?.getBoundingClientRect(); if (!r) return;
    const x = ((clientX - r.left) / r.width) * 1000; // stations are laid out in a 0..1000 frame
    let k = 0; VX.forEach((vx, i) => { if (Math.abs(vx - x) < Math.abs(VX[k] - x)) k = i; });
    setStep(k);
  }, []);
  const dragging = useRef(false);

  const cur = RELAY[step];
  const delivered = step === RELAY.length - 1;
  return (
    <div ref={ref} className={st.relay} onPointerEnter={() => setHold(true)} onPointerLeave={() => setHold(false)}>
      <div className={st.lanes}>
        <div ref={track} className={st.track} role="slider" tabIndex={0} aria-label="Escalation step" aria-valuemin={1} aria-valuemax={RELAY.length} aria-valuenow={step + 1} aria-valuetext={cur.t}
          onKeyDown={(e) => { if (e.key === "ArrowRight") setStep((x) => Math.min(RELAY.length - 1, x + 1)); if (e.key === "ArrowLeft") setStep((x) => Math.max(0, x - 1)); }}
          onPointerDown={(e) => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); scrub(e.clientX); }}
          onPointerMove={(e) => { if (dragging.current) scrub(e.clientX); }}
          onPointerUp={() => { dragging.current = false; }}>
          {LANES.map((l, i) => <div key={l} className={st.lane} style={{ top: `${(VY[i] / 300) * 100}%` }} data-on={cur.lane === i}><span>{l}</span></div>)}
          <svg className={st.path} viewBox={`0 0 ${size.w} ${size.h}`} aria-hidden>
            <path d={d} className={st.pathBase} />
            <path ref={trail} d={d} className={st.pathTrail} style={{ strokeDasharray: curve.total, strokeDashoffset: curve.total * (1 - u.current) }} />
          </svg>
          {RELAY.map((r, i) => (
            <button key={r.t} type="button" className={st.station} data-state={i === step ? "on" : i < step ? "done" : "next"}
              style={{ left: `${VX[i] / 10}%`, top: `${(VY[r.lane] / 300) * 100}%` }}
              onPointerDown={(e) => e.stopPropagation()} onClick={() => setStep(i)} aria-label={`${i + 1}. ${r.t}`}>
              <i>{i + 1}</i><span className={st.stLabel} data-edge={i === 0 ? "start" : i === RELAY.length - 1 ? "end" : undefined}>{r.t}</span>
            </button>
          ))}
          <span ref={dot} className={st.ring} aria-hidden><i /></span>
        </div>
        <p className={st.hint}>Drag along the lanes, or use ← → to replay a step.</p>
      </div>

      <article className={st.pass} data-step={step} onPointerMove={spot} onPointerLeave={unspot}>
        <header><span>Ticket</span><code>KKB-0142</code><span className={st.status} key={cur.status}>{cur.status}</span></header>
        <p className={st.q}>“Code freeze kab hai?”</p>
        <p className={st.now} key={step}><b>{step + 1}/{RELAY.length} · {cur.t}.</b> {cur.d}</p>
        <dl>
          <div><dt>From</dt><dd>Harsh · Sprint sync call</dd></div>
          <div><dt>Notes say</dt><dd><span className={step >= 2 ? st.struck : ""}>3:30</span> {step >= 2 ? <b className={st.newv}>3:45, if CI is green</b> : <em>proposed only</em>}</dd></div>
          <div><dt>Source</dt><dd>{step >= 3 ? "Decision v2 · approved by Charan" : step === 2 ? "Charan’s approval · saving" : "passage 11 · not approved"}</dd></div>
        </dl>
        <ol className={st.stamps}>
          {RELAY.slice(1, step + 1).map((r, i) => (
            <li key={r.t} style={{ "--i": i } as CSSProperties}>
              <span>{["10:41", "10:58", "10:58"][i] ?? (hungUp ? "next call" : "10:58")}</span>
              {r.log || (hungUp ? "Harsh had hung up · spoken at the start of his next call" : "spoken back to Harsh on the same call")}
            </li>
          ))}
        </ol>
        <footer>
          <label className={st.toggle}><input type="checkbox" checked={hungUp} onChange={(e) => setHungUp(e.target.checked)} /><i />Harsh hung up while waiting</label>
          {delivered && <span className={st.spoken}>“Approved by Charan: 3:45, once CI is green.”</span>}
        </footer>
      </article>
    </div>
  );
}
