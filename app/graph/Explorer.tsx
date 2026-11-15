"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import graphData from "../../data/demo/codegraph.json";
import indexData from "../../data/demo/codesearch.json";
import { search, type Hit, type SearchIndex, type SearchMode } from "../../lib/codegraph/search";

// Code graph explorer (cf. Voice Memory's memory graph): legend, search
// (semantic or keyword), pan/zoom/fit, node details with connections, and a
// guided "How the answer was chosen" tour that flies the camera along the path
// the Code Navigator took: function → defining file → callers → test.

type N = { id: string; kind: string; label: string; path: string; line: number; degree?: number; community?: number };
type E = { from: string; to: string; kind: string };
const G = graphData as unknown as { nodes: N[]; edges: E[]; sha: string; repository: string; godNodes: string[] };
const IDX = indexData as unknown as SearchIndex;

const KIND: Record<string, { c: string; label: string }> = {
  file: { c: "#9aa7ff", label: "File" }, test: { c: "#6fdc8c", label: "Test file" }, function: { c: "#ff8a65", label: "Function" },
  class: { c: "#f5c451", label: "Class" }, interface: { c: "#7cc4ff", label: "Interface" }, type: { c: "#5ee3d1", label: "Type" }, const: { c: "#b48cff", label: "Constant" },
};
const EDGE: Record<string, { c: string; dash: number[]; label: string }> = {
  defines: { c: "rgba(154,167,255,.28)", dash: [], label: "defines (file → symbol)" },
  imports: { c: "rgba(124,196,255,.35)", dash: [4, 4], label: "imports (file → file)" },
  uses: { c: "rgba(255,138,101,.45)", dash: [], label: "uses (file → function it calls)" },
  tests: { c: "rgba(111,220,140,.5)", dash: [2, 4], label: "tests (test → code)" },
};

const EDGE_STAGE: Record<string, number> = { defines: 2, imports: 3, uses: 4, tests: 5 };
let STAGE = 0; // read by the render loop; 0 = all
const visibleNode = (kind: string) => STAGE === 0 || (kind === "file" || kind === "test" ? STAGE >= 1 : STAGE >= 2);
const visibleEdge = (kind: string) => STAGE === 0 || STAGE >= (EDGE_STAGE[kind] ?? 2);

export function Explorer() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const pos = useRef(new Map<string, { x: number; y: number }>());
  const cam = useRef({ x: 0, y: 0, k: 1, tx: 0, ty: 0, tk: 1 });
  const [selected, setSelected] = useState<N | null>(null);
  const [q, setQ] = useState("how does the lead prove it's them with a fingerprint");
  const [mode, setMode] = useState<SearchMode>("semantic");
  const [hits, setHits] = useState<Hit[]>([]);
  const [path, setPath] = useState<string[]>([]);
  const [caption, setCaption] = useState("");
  const [touring, setTouring] = useState(false);
  const tourTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const byId = useMemo(() => new Map(G.nodes.map((n) => [n.id, n])), []);
  const highlight = useRef(new Set<string>());
  const selRef = useRef<string | null>(null);
  useEffect(() => { selRef.current = selected?.id ?? null; }, [selected]);
  // Build replay: 0 = everything shown; 1..5 = stages of graph construction.
  const stage = useRef(0);
  const [building, setBuilding] = useState(false);

  // Precompute a stable force layout (deterministic seed, files clustered by community).
  useEffect(() => {
    let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const nodes = G.nodes.map((n) => {
      const a = ((n.community ?? 0) / 16) * Math.PI * 2;
      return { id: n.id, x: Math.cos(a) * 420 + (rnd() - 0.5) * 200, y: Math.sin(a) * 320 + (rnd() - 0.5) * 200, vx: 0, vy: 0 };
    });
    const ix = new Map(nodes.map((n, i) => [n.id, i]));
    const edges = G.edges.filter((e) => ix.has(e.from) && ix.has(e.to)).map((e) => [ix.get(e.from)!, ix.get(e.to)!] as const);
    for (let it = 0; it < 260; it++) {
      const alpha = 1 - it / 260;
      for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j]; const dx = a.x - b.x, dy = a.y - b.y; const d2 = Math.max(100, dx * dx + dy * dy);
        if (d2 > 90000) continue; const f = (900 / d2) * alpha; a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f;
      }
      for (const [i, j] of edges) { const a = nodes[i], b = nodes[j]; const dx = b.x - a.x, dy = b.y - a.y; const d = Math.hypot(dx, dy) || 1; const f = ((d - 60) / d) * 0.03 * alpha; a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f; }
      for (const n of nodes) { n.vx += -n.x * 0.002 * alpha; n.vy += -n.y * 0.002 * alpha; n.vx *= 0.8; n.vy *= 0.8; n.x += Math.max(-8, Math.min(8, n.vx)); n.y += Math.max(-8, Math.min(8, n.vy)); }
    }
    for (const n of nodes) pos.current.set(n.id, { x: n.x, y: n.y });
  }, []);

  const flyTo = useCallback((ids: string[], k?: number) => {
    const ps = ids.map((id) => pos.current.get(id)).filter(Boolean) as { x: number; y: number }[];
    if (!ps.length || !canvas.current) return;
    const xs = ps.map((p) => p.x), ys = ps.map((p) => p.y);
    const W = canvas.current.clientWidth, H = canvas.current.clientHeight;
    const spanX = Math.max(...xs) - Math.min(...xs) + 160, spanY = Math.max(...ys) - Math.min(...ys) + 160;
    const kk = k ?? Math.min(2.4, Math.max(0.35, Math.min(W / spanX, H / spanY)));
    Object.assign(cam.current, { tx: -(Math.min(...xs) + Math.max(...xs)) / 2, ty: -(Math.min(...ys) + Math.max(...ys)) / 2, tk: kk });
  }, []);
  const fit = useCallback(() => flyTo(G.nodes.map((n) => n.id)), [flyTo]);

  // render loop with damped camera (frame-rate independent)
  useEffect(() => {
    const c = canvas.current!; const ctx = c.getContext("2d")!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let last = performance.now(), raf = 0;
    const resize = () => { c.width = c.clientWidth * dpr; c.height = c.clientHeight * dpr; };
    resize(); window.addEventListener("resize", resize);
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const cm = cam.current, f = 1 - Math.exp(-6 * dt);
      cm.x += (cm.tx - cm.x) * f; cm.y += (cm.ty - cm.y) * f; cm.k += (cm.tk - cm.k) * f;
      const W = c.clientWidth, H = c.clientHeight;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(cm.k, cm.k); ctx.translate(cm.x, cm.y);
      const hl = highlight.current, any = hl.size > 0, t = now / 1000;
      for (const e of G.edges) {
        const a = pos.current.get(e.from), b = pos.current.get(e.to); if (!a || !b) continue;
        if (!visibleEdge(e.kind)) continue;
        const lit = hl.has(e.from) && hl.has(e.to); const st = EDGE[e.kind] ?? EDGE.defines;
        ctx.strokeStyle = lit ? "#f5c451" : any ? "rgba(150,150,140,.06)" : st.c; ctx.lineWidth = (lit ? 2.4 : 0.8) / cm.k;
        ctx.setLineDash(lit ? [] : st.dash.map((d) => d / cm.k)); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      ctx.setLineDash([]);
      for (const n of G.nodes) {
        const p = pos.current.get(n.id); if (!p) continue;
        const lit = hl.has(n.id), sel = selRef.current === n.id;
        if (!visibleNode(n.kind)) continue;
        const r = (n.kind === "file" || n.kind === "test" ? 4 + Math.min(8, (n.degree ?? 0) / 5) : 3) * (lit ? 1.5 : 1);
        ctx.globalAlpha = any && !lit && !sel ? 0.18 : 1;
        if (lit || sel) { const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 4); g.addColorStop(0, `${KIND[n.kind]?.c ?? "#fff"}66`); g.addColorStop(1, "transparent"); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r * 4, 0, 6.283); ctx.fill(); }
        ctx.fillStyle = KIND[n.kind]?.c ?? "#999";
        if (n.kind === "file" || n.kind === "test") { ctx.beginPath(); ctx.roundRect(p.x - r, p.y - r, r * 2, r * 2, r * 0.45); ctx.fill(); }
        else { ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 6.283); ctx.fill(); }
        if (sel) { ctx.strokeStyle = "#f5c451"; ctx.lineWidth = 2 / cm.k; ctx.beginPath(); ctx.arc(p.x, p.y, r + 5 + Math.sin(t * 4) * 1.5, 0, 6.283); ctx.stroke(); }
        if (lit || sel || cm.k > 1.5 || (!any && G.godNodes.includes(n.id))) {
          ctx.globalAlpha = lit || sel ? 1 : any ? 0.3 : 0.85; ctx.fillStyle = lit || sel ? "#f2efe6" : "rgba(230,226,215,.8)";
          ctx.font = `${(lit || sel ? 600 : 400)} ${12 / cm.k}px Inter, system-ui, sans-serif`;
          ctx.fillText(n.kind === "file" || n.kind === "test" ? n.path : `${n.label}()`, p.x + r + 5 / cm.k, p.y + 4 / cm.k);
        }
        ctx.globalAlpha = 1;
      }
      ctx.restore();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    // pan + zoom + click
    let drag: { x: number; y: number; moved: boolean } | null = null;
    const toWorld = (ex: number, ey: number) => { const r = c.getBoundingClientRect(), cm = cam.current; return { x: (ex - r.left - r.width / 2) / cm.k - cm.x, y: (ey - r.top - r.height / 2) / cm.k - cm.y }; };
    const down = (e: PointerEvent) => { drag = { x: e.clientX, y: e.clientY, moved: false }; };
    const move = (e: PointerEvent) => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true; const cm = cam.current; cm.tx += dx / cm.k; cm.ty += dy / cm.k; cm.x = cm.tx; cm.y = cm.ty; drag.x = e.clientX; drag.y = e.clientY; };
    const up = (e: PointerEvent) => {
      if (drag && !drag.moved) {
        const w = toWorld(e.clientX, e.clientY); let best: N | null = null, bd = (14 / cam.current.k) ** 2;
        for (const n of G.nodes) { const p = pos.current.get(n.id)!; const d = (p.x - w.x) ** 2 + (p.y - w.y) ** 2; if (d < bd) { bd = d; best = n; } }
        setSelected(best);
      }
      drag = null;
    };
    const wheel = (e: WheelEvent) => { e.preventDefault(); const cm = cam.current; cm.tk = Math.max(0.25, Math.min(4, cm.tk * Math.exp(-e.deltaY * 0.0015))); };
    c.addEventListener("pointerdown", down); window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); c.addEventListener("wheel", wheel, { passive: false });
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); c.removeEventListener("pointerdown", down); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); c.removeEventListener("wheel", wheel); };
  }, []);

  const runSearch = useCallback((text = q, m = mode) => {
    const h = search(IDX, G as unknown as Parameters<typeof search>[1], text, m, 8);
    setHits(h); setSelected(h[0] ? byId.get(h[0].id) ?? null : null);
    highlight.current = new Set(h.slice(0, 1).map((x) => x.id));
    if (h[0]) flyTo([h[0].id], 1.8);
    setPath([]); setCaption(h[0] ? `Top match: ${h[0].label} — ${h[0].why.join(" · ")}` : "No match at this commit.");
  }, [q, mode, byId, flyTo]);

  // The route the Code Navigator takes from a hit: symbol → file → callers → test.
  const routeFor = useCallback((id: string) => {
    const n = byId.get(id); if (!n) return [] as { id: string; text: string }[];
    const file = G.edges.find((e) => e.to === id && e.kind === "defines")?.from ?? (n.kind === "file" ? n.id : undefined);
    const callers = G.edges.filter((e) => e.to === id && e.kind === "uses").map((e) => e.from).slice(0, 2);
    const tests = G.edges.filter((e) => (e.to === id || e.to === file) && e.kind === "tests").map((e) => e.from).slice(0, 1);
    const hit = hits.find((h) => h.id === id);
    return [
      { id, text: `The question matched ${n.label} (${hit?.why.join(" · ") ?? "selected"}).` },
      ...(file && file !== id ? [{ id: file, text: `It is defined in ${byId.get(file)?.path}, line ${n.line}, at commit ${G.sha.slice(0, 7)}.` }] : []),
      ...callers.map((c) => ({ id: c, text: `${byId.get(c)?.path} calls it — that's how it's reached.` })),
      ...tests.map((tt) => ({ id: tt, text: `${byId.get(tt)?.path} tests it — run this to check a fix.` })),
    ];
  }, [byId, hits]);

  const tour = useCallback(() => {
    const target = selected?.id ?? hits[0]?.id; if (!target) return;
    const route = routeFor(target); if (!route.length) return;
    setTouring(true); setPath(route.map((r) => r.id));
    let i = 0;
    const stepTo = () => {
      if (i >= route.length) { highlight.current = new Set(route.map((r) => r.id)); flyTo(route.map((r) => r.id)); setCaption("That's the path the Code Navigator explains on the call."); setTouring(false); return; }
      highlight.current = new Set(route.slice(0, i + 1).map((r) => r.id));
      flyTo([route[i].id], 2.2); setCaption(route[i].text); setSelected(byId.get(route[i].id) ?? null);
      i++; tourTimer.current = setTimeout(stepTo, 2400);
    };
    stepTo();
  }, [selected, hits, routeFor, flyTo, byId]);
  const stop = () => { if (tourTimer.current) clearTimeout(tourTimer.current); setTouring(false); setBuilding(false); STAGE = 0; stage.current = 0; };

  useEffect(() => {
    fit();
    const asked = new URLSearchParams(window.location.search).get("q")?.trim();
    if (asked) setQ(asked);
    const t = setTimeout(() => runSearch(asked || q), 900); return () => clearTimeout(t); }, []);

  // "How the graph is built": replay construction stage by stage, with real counts.
  const build = useCallback(() => {
    if (tourTimer.current) clearTimeout(tourTimer.current);
    const n = (k: string) => G.nodes.filter((x) => x.kind === k).length;
    const e = (k: string) => G.edges.filter((x) => x.kind === k).length;
    const steps = [
      `1 · Read every source file at commit ${G.sha.slice(0, 7)}: ${n("file")} files and ${n("test")} test files.`,
      `2 · Parse each file for functions, classes, types and constants: ${G.nodes.length - n("file") - n("test")} symbols, ${e("defines")} "defines" edges.`,
      `3 · Resolve every import to the file it points at: ${e("imports")} "imports" edges.`,
      `4 · Link each file to the functions it actually calls: ${e("uses")} "uses" edges.`,
      `5 · Link tests to the code they exercise: ${e("tests")} "tests" edges. Then index every node for search (name, path, comments, body).`,
    ];
    highlight.current = new Set(); setSelected(null); setPath([]); setBuilding(true); fit();
    let i = 0;
    const next = () => {
      if (i >= steps.length) { STAGE = 0; stage.current = 0; setBuilding(false); setCaption(`Done: ${G.nodes.length} nodes, ${G.edges.length} edges, computed from the code — nothing hand-drawn. Now ask it something.`); return; }
      STAGE = i + 1; stage.current = STAGE; setCaption(steps[i]); i++;
      tourTimer.current = setTimeout(next, 2600);
    };
    next();
  }, [fit]);

  const conns = selected ? G.edges.filter((e) => e.from === selected.id || e.to === selected.id).slice(0, 12) : [];
  const counts = useMemo(() => Object.fromEntries(Object.keys(KIND).map((k) => [k, G.nodes.filter((n) => n.kind === k).length])), []);

  return (
    <div style={{ position: "relative", height: "100vh", background: "#000", color: "#f2efe6", fontFamily: "var(--font-sans), Inter, system-ui, sans-serif", overflow: "hidden" }}>
      <canvas ref={canvas} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", cursor: "grab" }} aria-label="Code graph of this repository" />
      {/* top bar */}
      <div style={{ position: "absolute", top: 14, left: 16, right: 16, display: "flex", gap: 10, alignItems: "center", pointerEvents: "none" }}>
        <a href="/" style={{ pointerEvents: "auto", color: "#d6d2c6", textDecoration: "none", fontSize: 13, padding: "7px 12px", border: "1px solid #262522", borderRadius: 10, background: "rgba(10,10,10,.8)" }}>← Kaam Ki Baat</a>
        <span style={{ fontSize: 13, color: "#8a877e" }}>Code graph · {G.repository} @ {G.sha.slice(0, 7)}</span>
        <a href="/story" style={{ pointerEvents: "auto", color: "#d6d2c6", textDecoration: "none", fontSize: 13, padding: "7px 12px", border: "1px solid #262522", borderRadius: 10, background: "rgba(10,10,10,.8)" }}>How the codebase grew →</a>
        <form onSubmit={(e) => { e.preventDefault(); runSearch(); }} style={{ marginLeft: "auto", display: "flex", gap: 6, pointerEvents: "auto" }}>
          <div style={{ display: "flex", border: "1px solid #262522", borderRadius: 10, overflow: "hidden" }}>
            {(["semantic", "keyword"] as SearchMode[]).map((m) => (
              <button key={m} type="button" onClick={() => { setMode(m); runSearch(q, m); }} style={{ padding: "7px 10px", fontSize: 12, border: 0, cursor: "pointer", background: mode === m ? "#f0d35c" : "rgba(10,10,10,.85)", color: mode === m ? "#000" : "#d6d2c6" }}>{m}</button>
            ))}
          </div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask in plain words, or type a function / file name…" aria-label="Search the code"
            style={{ width: "min(46vw, 520px)", padding: "8px 12px", borderRadius: 10, border: "1px solid #262522", background: "rgba(10,10,10,.85)", color: "#f2efe6", fontSize: 13.5 }} />
          <button type="submit" style={{ padding: "8px 14px", borderRadius: 10, border: 0, background: "#f0d35c", color: "#000", fontWeight: 650, cursor: "pointer" }}>Search</button>
        </form>
      </div>
      {/* legend */}
      <aside style={{ position: "absolute", top: 64, left: 16, width: 250, padding: 16, borderRadius: 16, background: "rgba(10,10,10,.86)", border: "1px solid #1d1d1b", fontSize: 12.5, lineHeight: 1.5, maxHeight: "calc(100vh - 150px)", overflow: "auto" }}>
        <div style={{ fontWeight: 650, fontSize: 14 }}>Code graph</div>
        <div style={{ color: "#8a877e", margin: "4px 0 10px" }}>Every file, function and test in this repo, built from the pinned commit. The Code Navigator answers from these edges.</div>
        {Object.entries(KIND).map(([k, v]) => <div key={k} style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ width: 10, height: 10, borderRadius: k === "file" || k === "test" ? 3 : 10, background: v.c }} />{v.label} <span style={{ color: "#5a5852", marginLeft: "auto" }}>{counts[k]}</span></div>)}
        <div style={{ fontWeight: 650, marginTop: 12 }}>Edges</div>
        {Object.entries(EDGE).map(([k, v]) => <div key={k} style={{ display: "flex", alignItems: "center", gap: 8 }}><svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke={v.c.replace(/[\d.]+\)$/, "1)")} strokeWidth="2" strokeDasharray={v.dash.join(" ")} /></svg>{v.label}</div>)}
        <div style={{ color: "#5a5852", marginTop: 10 }}>{G.nodes.length} nodes · {G.edges.length} edges · computed from the files</div>
        {hits.length > 0 && <>
          <div style={{ fontWeight: 650, marginTop: 12 }}>Results · {mode}</div>
          {hits.map((h, i) => (
            <button key={h.id} onClick={() => { setSelected(byId.get(h.id) ?? null); highlight.current = new Set([h.id]); flyTo([h.id], 2); }} style={{ display: "block", width: "100%", textAlign: "left", background: selected?.id === h.id ? "rgba(240,211,92,.12)" : "transparent", border: 0, color: "#f2efe6", padding: "5px 6px", borderRadius: 8, cursor: "pointer", fontSize: 12.5 }}>
              <span style={{ color: KIND[h.kind]?.c }}>{i + 1}. {h.label}</span> <span style={{ color: "#5a5852" }}>{h.path.split("/").slice(-2).join("/")}:{h.line}</span>
            </button>
          ))}
        </>}
      </aside>
      {/* details */}
      {selected && (
        <aside style={{ position: "absolute", top: 64, right: 16, width: 300, padding: 18, borderRadius: 16, background: "rgba(10,10,10,.92)", border: "1px solid #1d1d1b", fontSize: 13 }}>
          <button onClick={() => setSelected(null)} aria-label="Close" style={{ position: "absolute", top: 10, right: 12, background: "none", border: 0, color: "#8a877e", cursor: "pointer", fontSize: 16 }}>×</button>
          <div style={{ fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: KIND[selected.kind]?.c }}>{KIND[selected.kind]?.label ?? selected.kind}</div>
          <div style={{ fontFamily: "var(--font-serif), Georgia, serif", fontSize: 24, margin: "4px 0 8px", wordBreak: "break-word" }}>{selected.kind === "file" || selected.kind === "test" ? selected.path.split("/").pop() : selected.label}</div>
          <div style={{ fontFamily: "var(--font-mono), ui-monospace, monospace", fontSize: 12, color: "#aaa69a", background: "#050505", borderRadius: 10, padding: "8px 10px" }}>{selected.path}:{selected.line} @ {G.sha.slice(0, 7)}</div>
          <div style={{ color: "#8a877e", margin: "12px 0 6px" }}>Connections ({conns.length})</div>
          {conns.map((e, i) => { const other = byId.get(e.from === selected.id ? e.to : e.from); return other && (
            <button key={i} onClick={() => { setSelected(other); highlight.current = new Set([selected.id, other.id]); flyTo([other.id], 2); }} style={{ display: "flex", width: "100%", justifyContent: "space-between", gap: 8, background: "#121211", border: 0, borderRadius: 8, padding: "6px 8px", marginBottom: 4, color: "#ece8dc", cursor: "pointer", fontSize: 12.5 }}>
              <span>{e.from === selected.id ? "→" : "←"} {other.kind === "file" || other.kind === "test" ? other.path.split("/").pop() : other.label}</span><span style={{ color: "#5a5852" }}>{e.kind}</span>
            </button>); })}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <a href={`https://github.com/${G.repository}/blob/${G.sha}/${selected.path}#L${selected.line}`} target="_blank" rel="noreferrer" style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #262522", color: "#f2efe6", textDecoration: "none", fontSize: 12.5 }}>Open at commit ↗</a>
            <button onClick={tour} style={{ padding: "8px 12px", borderRadius: 10, border: 0, background: "#f0d35c", color: "#000", fontWeight: 650, cursor: "pointer", fontSize: 12.5 }}>Trace the route →</button>
          </div>
        </aside>
      )}
      {/* caption + controls */}
      <div aria-live="polite" style={{ position: "absolute", left: "50%", bottom: 70, transform: "translateX(-50%)", maxWidth: "min(760px, 90vw)", textAlign: "center", fontFamily: "var(--font-serif), Georgia, serif", fontSize: 20, textShadow: "0 2px 12px #000" }}>{caption}</div>
      <div style={{ position: "absolute", left: "50%", bottom: 18, transform: "translateX(-50%)", display: "flex", gap: 6 }}>
        {[["+", () => { cam.current.tk = Math.min(4, cam.current.tk * 1.3); }], ["−", () => { cam.current.tk = Math.max(0.25, cam.current.tk / 1.3); }], ["Fit", () => { highlight.current = new Set(path); fit(); }]].map(([l, f]) => (
          <button key={l as string} onClick={f as () => void} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #262522", background: "rgba(10,10,10,.86)", color: "#f2efe6", cursor: "pointer" }}>{l as string}</button>
        ))}
        <button onClick={building ? stop : build} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid #262522", background: "rgba(10,10,10,.86)", color: "#f2efe6", cursor: "pointer" }}>{building ? "■ Stop" : "▶ How the graph is built"}</button>
        <button onClick={touring ? stop : tour} style={{ padding: "8px 14px", borderRadius: 10, border: 0, background: "#f0d35c", color: "#000", fontWeight: 650, cursor: "pointer" }}>{touring ? "■ Stop" : "▶ How the answer was chosen"}</button>
      </div>
    </div>
  );
}
