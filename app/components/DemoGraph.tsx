"use client";
import { useEffect, useRef, useState } from "react";

// "Every answer walks a path you can see." — a Voice Memory–style graph card.
// A comet travels the real route of one demo question:
//   voice question → agent → Team Memory → Wispr MCP → meeting line
//   → Code Navigator → Graphify code graph → file → function → test → fix branch / PR
// Background nodes are this repo's real code graph (data/demo/codegraph.json).

type GNode = { id: string; kind: string; label: string; path: string; community?: number; degree?: number };
type Graph = { nodes: GNode[]; edges: { from: string; to: string }[]; sha: string; repository: string };

const C = { ink: "#f2efe6", mute: "#8e93b0", left: "#7cc4ff", center: "#f5c451", right: "#ff8a65", ok: "#6fdc8c", wispr: "#b48cff" };

// Key nodes, positioned in a 100x100 space (x, y).
const KEY = [
  { id: "q", label: "“woh bug wala code kahan hai?”", sub: "Harsh, on a call", x: 50, y: 8, c: C.ink, r: 7 },
  { id: "agent", label: "Kaam Ki Baat", sub: "understands the words", x: 50, y: 30, c: C.center, r: 9 },
  { id: "tm", label: "Team Memory", sub: "left agent", x: 22, y: 44, c: C.left, r: 7 },
  { id: "wispr", label: "Wispr MCP", sub: "read-only, one approved meeting", x: 12, y: 64, c: C.wispr, r: 6 },
  { id: "meet", label: "kkb#18 · Charan", sub: "“Harsh owns the fix. Start from persistVerifiedUpdate.”", x: 24, y: 84, c: C.wispr, r: 5 },
  { id: "cn", label: "Code Navigator", sub: "right agent", x: 78, y: 44, c: C.right, r: 7 },
  { id: "graph", label: "Graphify code graph", sub: "files · functions · tests", x: 86, y: 61, c: C.right, r: 6 },
  { id: "file", label: "persist-update.ts", sub: "lib/core", x: 70, y: 70, c: C.right, r: 5 },
  { id: "fn", label: "persistVerifiedUpdate()", sub: "timeout + read-back lines", x: 80, y: 82, c: C.right, r: 5 },
  { id: "test", label: "persist-update.test.ts", sub: "regression test", x: 62, y: 90, c: C.ok, r: 4.5 },
  { id: "pr", label: "fix branch → PR", sub: "pinned to commit SHA", x: 90, y: 94, c: C.ok, r: 5 },
];
const PATH = ["q", "agent", "tm", "wispr", "meet", "tm", "agent", "cn", "graph", "file", "fn", "test", "pr"];
const CAPTIONS: Record<string, string> = {
  q: "Harsh asks out loud. Bolna turns the voice into text.",
  agent: "Kaam Ki Baat cleans it up and resolves “woh bug” to his task.",
  tm: "Left: Team Memory checks what the team actually decided.",
  wispr: "It reads the approved meeting through the Wispr MCP.",
  meet: "Source found: Charan, line kkb#18 — Harsh owns the fix.",
  cn: "Right: the Code Navigator takes over.",
  graph: "It walks this repo's code graph instead of grepping.",
  file: "Lands on lib/core/persist-update.ts at the pinned commit.",
  fn: "persistVerifiedUpdate — the timeout and read-back lines get boxed.",
  test: "Its regression test is the way to check the fix.",
  pr: "Fix on a branch, PR against main, merged only after checks pass.",
};

export function DemoGraph({ graph }: { graph: Graph }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const c = canvas.current;
    if (!c || !visible) return;
    const ctx = c.getContext("2d")!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let W = c.clientWidth, H = c.clientHeight;
    const resize = () => { W = c.clientWidth; H = c.clientHeight; c.width = W * dpr; c.height = H * dpr; };
    resize();
    window.addEventListener("resize", resize);

    // seeded background from the real code graph
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const bg = graph.nodes.filter((n) => n.kind === "file" || n.kind === "test" || (n.degree ?? 0) > 4).slice(0, 90)
      .map((n) => ({ id: n.id, x: 4 + rnd() * 92, y: 4 + rnd() * 92, ph: rnd() * 6.28, r: 1.2 + Math.min(2.6, (n.degree ?? 0) / 12) }));
    const bgIdx = new Map(bg.map((b, i) => [b.id, i]));
    const bgEdges = graph.edges.filter((e) => bgIdx.has(e.from) && bgIdx.has(e.to)).slice(0, 160);
    const key = new Map(KEY.map((k) => [k.id, k]));
    const P = (x: number, y: number) => [x / 100 * W, y / 100 * H] as const;

    const SEG_MS = 1500, HOLD_MS = 2400;
    const total = (PATH.length - 1) * SEG_MS + HOLD_MS;
    const t0 = performance.now();
    const trail: { x: number; y: number }[] = [];
    let raf = 0;

    const frame = (now: number) => {
      const t = reduce ? total - 1 : Math.max(0, now - t0) % total;
      const seg = Math.min(PATH.length - 2, Math.floor(t / SEG_MS));
      const u = Math.min(1, (t - seg * SEG_MS) / SEG_MS);
      const ease = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; // easeInOutCubic
      const done = t >= (PATH.length - 1) * SEG_MS;
      const reachedIdx = done ? PATH.length - 1 : seg + (u > 0.98 ? 1 : 0);
      const visited = new Set(PATH.slice(0, reachedIdx + 1));
      setStep((s) => (s !== reachedIdx ? reachedIdx : s));

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const time = now / 1000;
      // background constellation
      ctx.strokeStyle = "rgba(142,147,176,.10)"; ctx.lineWidth = 0.8;
      for (const e of bgEdges) {
        const a = bg[bgIdx.get(e.from)!], b = bg[bgIdx.get(e.to)!];
        const [ax, ay] = P(a.x + Math.sin(time * 0.3 + a.ph) * 0.6, a.y + Math.cos(time * 0.27 + a.ph) * 0.6);
        const [bx, by] = P(b.x + Math.sin(time * 0.3 + b.ph) * 0.6, b.y + Math.cos(time * 0.27 + b.ph) * 0.6);
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      }
      for (const b of bg) {
        const [x, y] = P(b.x + Math.sin(time * 0.3 + b.ph) * 0.6, b.y + Math.cos(time * 0.27 + b.ph) * 0.6);
        ctx.fillStyle = "rgba(111,170,160,.35)"; ctx.beginPath(); ctx.arc(x, y, b.r, 0, 6.283); ctx.fill();
      }
      // path edges: visited glow, upcoming dashed
      for (let i = 0; i < PATH.length - 1; i++) {
        const a = key.get(PATH[i])!, b = key.get(PATH[i + 1])!;
        const [ax, ay] = P(a.x, a.y), [bx, by] = P(b.x, b.y);
        const lit = i < reachedIdx;
        ctx.setLineDash(lit ? [] : [3, 6]);
        ctx.strokeStyle = lit ? `${b.c}aa` : "rgba(142,147,176,.22)";
        ctx.lineWidth = lit ? 1.8 : 1;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      }
      ctx.setLineDash([]);
      // key nodes
      for (const k of KEY) {
        const [x, y] = P(k.x, k.y);
        const on = visited.has(k.id), cur = PATH[reachedIdx] === k.id;
        if (on) {
          const g = ctx.createRadialGradient(x, y, 0, x, y, k.r * (cur ? 5 : 3.4));
          g.addColorStop(0, `${k.c}66`); g.addColorStop(1, `${k.c}00`);
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, k.r * (cur ? 5 : 3.4), 0, 6.283); ctx.fill();
        }
        ctx.fillStyle = on ? k.c : "rgba(142,147,176,.45)";
        ctx.beginPath(); ctx.arc(x, y, k.r * (cur ? 1.25 + 0.12 * Math.sin(time * 6) : 1), 0, 6.283); ctx.fill();
        ctx.font = `${on ? 600 : 500} 12px Inter, ui-sans-serif, system-ui, sans-serif`;
        ctx.fillStyle = on ? C.ink : "rgba(142,147,176,.55)";
        const left = k.x > 60, tx = left ? x - k.r - 8 : x + k.r + 8;
        ctx.textAlign = k.id === "q" || k.id === "agent" ? "center" : left ? "right" : "left";
        const ty = k.id === "q" ? y - 14 : k.id === "agent" ? y + 24 : y + 4;
        ctx.fillText(k.label, k.id === "q" || k.id === "agent" ? x : tx, ty);
        if (on && cur) {
          ctx.font = "11px ui-monospace, Menlo, monospace"; ctx.fillStyle = C.mute;
          ctx.fillText(k.sub, k.id === "q" || k.id === "agent" ? x : tx, ty + 15);
        }
      }
      // comet with a fading trail
      if (!done) {
        const a = key.get(PATH[seg])!, b = key.get(PATH[seg + 1])!;
        const [ax, ay] = P(a.x, a.y), [bx, by] = P(b.x, b.y);
        const x = ax + (bx - ax) * ease, y = ay + (by - ay) * ease;
        trail.push({ x, y }); if (trail.length > 22) trail.shift();
        trail.forEach((p, i) => {
          ctx.fillStyle = `rgba(245,196,81,${(i / trail.length) * 0.55})`;
          ctx.beginPath(); ctx.arc(p.x, p.y, 1 + (i / trail.length) * 3, 0, 6.283); ctx.fill();
        });
        const g = ctx.createRadialGradient(x, y, 0, x, y, 16);
        g.addColorStop(0, "rgba(255,240,190,1)"); g.addColorStop(0.3, "rgba(245,196,81,.75)"); g.addColorStop(1, "rgba(245,196,81,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 16, 0, 6.283); ctx.fill();
      } else trail.length = 0;
      // voice ripples on the question node while it is being "spoken"
      if (reachedIdx <= 1) {
        const [qx, qy] = P(key.get("q")!.x, key.get("q")!.y);
        for (let i = 0; i < 3; i++) {
          const ph = ((time * 0.9 + i / 3) % 1);
          ctx.strokeStyle = `rgba(242,239,230,${0.5 * (1 - ph)})`; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(qx, qy, 8 + ph * 26, 0, 6.283); ctx.stroke();
        }
      }
      if (!reduce) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, [graph, visible]);

  const current = PATH[step];
  const sideOf = (id: string) => (["tm", "wispr", "meet"].includes(id) ? "left" : ["cn", "graph", "file", "fn", "test", "pr"].includes(id) ? "right" : "center");
  const steps = [
    { k: "Voice in", ids: ["q"], c: C.ink },
    { k: "Understood", ids: ["agent"], c: C.center },
    { k: "Wispr MCP → meeting line", ids: ["tm", "wispr", "meet"], c: C.wispr },
    { k: "Graphify → file → function", ids: ["cn", "graph", "file", "fn"], c: C.right },
    { k: "Test → branch → PR", ids: ["test", "pr"], c: C.ok },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", gap: 0, borderRadius: 28, overflow: "hidden", marginTop: 40,
      background: "radial-gradient(120% 120% at 70% 20%, #1d2547 0%, #141a33 45%, #10142a 100%)", border: "1px solid #232a48" }}>
      <div style={{ padding: "36px 32px", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ color: "#f0d35c", fontSize: 14, fontWeight: 600 }}>Live demo graph</div>
        <div style={{ fontFamily: "var(--serif)", fontSize: "clamp(30px, 3.4vw, 46px)", lineHeight: 1.05, color: C.ink }}>Every answer walks a path you can see.</div>
        <p style={{ color: "#a9adc6", lineHeight: 1.6, fontSize: 15.5, margin: 0 }}>
          One question, traced end to end: from voice, to the meeting line that decided it, to the exact function in this repo, to the branch that fixes it.
        </p>
        <ol style={{ listStyle: "none", padding: 0, margin: "6px 0 0", display: "flex", flexDirection: "column", gap: 8 }}>
          {steps.map((s, i) => {
            const on = s.ids.includes(current) || (i === steps.length - 1 && step === PATH.length - 1);
            return (
              <li key={s.k} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: on ? C.ink : "#6d7290", transition: "color .4s" }}>
                <span style={{ width: 9, height: 9, borderRadius: 9, background: on ? s.c : "#2c3253", boxShadow: on ? `0 0 12px ${s.c}` : "none", transition: "all .4s" }} />{s.k}
              </li>
            );
          })}
        </ol>
        <div aria-live="polite" style={{ marginTop: "auto", minHeight: 44, fontFamily: "var(--mono)", fontSize: 12.5, lineHeight: 1.5, color: sideOf(current) === "left" ? C.left : sideOf(current) === "right" ? C.right : C.center }}>
          {CAPTIONS[current]}
        </div>
        <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "#5d6283" }}>background: {graph.nodes.length} real nodes from {graph.repository} @ {graph.sha.slice(0, 7)}</div>
      </div>
      <canvas ref={canvas} style={{ width: "100%", height: 560, display: "block" }} aria-label="Animated path of a question through Team Memory, the Wispr MCP, the code graph and a pull request" />
    </div>
  );
}
