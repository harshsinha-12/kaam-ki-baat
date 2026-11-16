"use client";
import { useEffect, useRef, useState } from "react";

// Force-directed view of the repo's code graph (cf. Graphify graph.html and the
// Voice Memory graph). Canvas + a tiny spring simulation; no dependencies.
// `highlight` lights the answer path (seed → file → callers → tests).

export interface ViewNode { id: string; kind: string; label: string; path: string; line: number; community?: number; degree?: number }
export interface ViewGraph { nodes: ViewNode[]; edges: { from: string; to: string; kind: string }[]; godNodes: string[]; sha: string; repository: string }

const PALETTE = ["#7cc4ff", "#f5c451", "#ff8a65", "#6fdc8c", "#b48cff", "#ff6bb5", "#5ee3d1", "#d6e36b", "#9aa7ff", "#ffb36b"];

export function CodeGraphView({ graph, highlight = [], height = 460, onPick }: { graph: ViewGraph; highlight?: string[]; height?: number; onPick?: (n: ViewNode) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const hl = useRef(new Set<string>());
  const redraw = useRef<(() => void) | null>(null);
  const [hover, setHover] = useState<ViewNode | null>(null);
  const [reduced, setReduced] = useState(true);
  hl.current = new Set(highlight);
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(preference.matches);
    update(); preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);
  useEffect(() => { redraw.current?.(); }, [highlight]);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let W = c.clientWidth || 800, H = height;
    c.width = W * dpr; c.height = H * dpr;
    // keep files + the most connected symbols so the picture stays legible
    const keep = new Set(graph.nodes.map((n) => n.id)); // all nodes, so any answer path can light up
    const nodes = graph.nodes.filter((n) => keep.has(n.id)).map((n, i) => {
      const a = ((n.community ?? 0) / 8) * Math.PI * 2;
      return { ...n, x: W / 2 + Math.cos(a) * W * 0.25 + ((i * 37) % 60) - 30, y: H / 2 + Math.sin(a) * H * 0.25 + ((i * 53) % 60) - 30, vx: 0, vy: 0 };
    });
    const idx = new Map(nodes.map((n, i) => [n.id, i]));
    const edges = graph.edges.filter((e) => idx.has(e.from) && idx.has(e.to)).map((e) => [idx.get(e.from)!, idx.get(e.to)!, e.kind] as const);
    let raf = 0, t = 0;

    const tick = () => {
      t++;
      const alpha = Math.max(0.02, 1 - t / 400);
      for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const dx = a.x - b.x, dy = a.y - b.y, d2 = Math.max(64, dx * dx + dy * dy);
        if (d2 > 22000) continue;
        const f = (160 / d2) * alpha;
        a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f;
      }
      for (const [i, j] of edges) {
        const a = nodes[i], b = nodes[j];
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
        const f = ((d - 46) / d) * 0.02 * alpha;
        a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f;
      }
      for (const n of nodes) {
        n.vx += (W / 2 - n.x) * 0.004 * alpha; n.vy += (H / 2 - n.y) * 0.004 * alpha;
        n.vx *= 0.82; n.vy *= 0.82;
        const v = Math.hypot(n.vx, n.vy); if (v > 4) { n.vx *= 4 / v; n.vy *= 4 / v; }
        n.x = Math.max(12, Math.min(W - 12, n.x + n.vx)); n.y = Math.max(12, Math.min(H - 12, n.y + n.vy));
      }
      draw();
      if (!reduced && t < 400) raf = requestAnimationFrame(tick);
    };

    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const on = hl.current, any = on.size > 0;
      for (const [i, j] of edges) {
        const a = nodes[i], b = nodes[j], lit = on.has(a.id) && on.has(b.id);
        ctx.strokeStyle = lit ? "rgba(245,196,81,.95)" : any ? "rgba(140,140,130,.06)" : "rgba(140,140,130,.16)";
        ctx.lineWidth = lit ? 2 : 0.7;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      for (const n of nodes) {
        const lit = on.has(n.id), god = graph.godNodes.includes(n.id);
        const r = n.kind === "file" || n.kind === "test" ? 3 + Math.min(7, (n.degree ?? 0) / 6) : 2.2;
        ctx.globalAlpha = any && !lit ? 0.18 : 1;
        ctx.fillStyle = n.kind === "test" ? "#6e6a62" : PALETTE[(n.community ?? 0) % PALETTE.length];
        ctx.beginPath(); ctx.arc(n.x, n.y, lit ? r + 3 : r, 0, Math.PI * 2); ctx.fill();
        if (lit) { ctx.strokeStyle = "#f5c451"; ctx.lineWidth = 2; ctx.stroke(); }
        if (lit || (god && !any)) {
          ctx.globalAlpha = 1; ctx.fillStyle = lit ? "#f2efe6" : "rgba(242,239,230,.7)";
          ctx.font = "11px ui-monospace, Menlo, monospace";
          ctx.fillText(n.kind === "file" || n.kind === "test" ? n.path : `${n.label}()`, n.x + r + 4, n.y + 3);
        }
        ctx.globalAlpha = 1;
      }
    };

    const pick = (e: MouseEvent) => {
      const rect = c.getBoundingClientRect(), x = e.clientX - rect.left, y = e.clientY - rect.top;
      let best: (typeof nodes)[number] | null = null, bd = 144;
      for (const n of nodes) { const d = (n.x - x) ** 2 + (n.y - y) ** 2; if (d < bd) { bd = d; best = n; } }
      return best;
    };
    const move = (e: MouseEvent) => setHover(pick(e));
    const click = (e: MouseEvent) => { const n = pick(e); if (n && onPick) onPick(n); };
    redraw.current = draw;
    const resize = () => { W = c.clientWidth; c.width = W * dpr; draw(); };
    c.addEventListener("mousemove", move); c.addEventListener("click", click); window.addEventListener("resize", resize);
    draw();
    if (!reduced) raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); redraw.current = null; c.removeEventListener("mousemove", move); c.removeEventListener("click", click); window.removeEventListener("resize", resize); };
  }, [graph, height, onPick, reduced]);

  return (
    <div style={{ position: "relative" }}>
      <canvas ref={canvas} style={{ width: "100%", height, display: "block", cursor: hover ? "pointer" : "default" }} aria-label={`Code graph of ${graph.repository} at ${graph.sha.slice(0, 7)}`} />
      {hover && (
        <div style={{ position: "absolute", left: 12, bottom: 12, font: "12px ui-monospace, Menlo, monospace", color: "#d8d4c8", background: "rgba(10,10,9,.85)", border: "1px solid #24231f", borderRadius: 8, padding: "6px 10px" }}>
          {hover.kind} · {hover.kind === "file" || hover.kind === "test" ? hover.path : `${hover.label} in ${hover.path}:${hover.line}`} · degree {hover.degree}
        </div>
      )}
    </div>
  );
}
