"use client";
import { useEffect, useRef, useState } from "react";
import { zone } from "../zones/client";

// Browser control for the Code Navigator: whatever the call (or this page)
// last pointed at is opened here, pinned to the SHA, with the exact lines boxed
// and the reason written beside each box. Polls the caller's own focus only.

type Focus = { path: string; sha: string; url: string; symbol: string; from: string; at: string;
  steps: { title: string; text: string }[]; highlights: { start: number; end: number; reason: string }[]; lines: { n: number; text: string }[] };

export function CodeFocus() {
  const [f, setF] = useState<Focus | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const lastAt = useRef("");
  useEffect(() => {
    const poll = async () => {
      const r = await zone<{ focus: Focus | null }>("code_focus");
      const next = r.data.focus;
      if (next && next.at !== lastAt.current) { lastAt.current = next.at; setF(next); }
    };
    poll(); const id = setInterval(poll, 2000); return () => clearInterval(id);
  }, []);
  useEffect(() => { box.current?.querySelector("[data-hot='true']")?.scrollIntoView({ behavior: "smooth", block: "center" }); }, [f]);
  if (!f) return <p style={{ font: "12px ui-monospace, Menlo, monospace", color: "#9a968c" }}>Ask “woh code kahan hai?” on the call or above, and the exact lines open here.</p>;
  const hot = (n: number) => f.highlights.find((h) => n >= h.start && n <= h.end);
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, font: "12px ui-monospace, Menlo, monospace", color: "#9a968c", flexWrap: "wrap" }}>
        <span>{f.path} · <b style={{ color: "#f2efe6" }}>{f.symbol}</b> @ {f.sha.slice(0, 7)} · from your {f.from === "call" ? "call" : "question"}</span>
        <a href={f.url} target="_blank" rel="noreferrer" style={{ color: "#ff8a65" }}>open on GitHub ↗</a>
      </div>
      <ol style={{ margin: "12px 0", paddingLeft: 18, fontSize: 14, lineHeight: 1.55 }}>
        {f.steps.map((s) => <li key={s.title}><b>{s.title}.</b> <span style={{ color: "#c9c5ba" }}>{s.text}</span></li>)}
      </ol>
      <div ref={box} style={{ maxHeight: 300, overflow: "auto", background: "#0e0e0d", border: "1px solid #24231f", borderRadius: 12, padding: "8px 0", font: "12.5px/1.7 ui-monospace, Menlo, monospace" }}>
        {f.lines.map((l) => {
          const h = hot(l.n);
          return (
            <div key={l.n} data-hot={Boolean(h)} style={{ display: "grid", gridTemplateColumns: "44px 1fr auto", gap: 10, padding: "0 10px", whiteSpace: "pre",
              outline: h ? "2px solid #ff8a65" : "none", outlineOffset: -2, background: h ? "rgba(255,138,101,.10)" : "transparent", borderRadius: 4 }}>
              <span style={{ color: h ? "#ff8a65" : "#4f4c45", textAlign: "right" }}>{l.n}</span>
              <span style={{ color: "#d8d4c8", overflow: "hidden", textOverflow: "ellipsis" }}>{l.text || " "}</span>
              {h && <span style={{ color: "#ff8a65", fontFamily: "Inter, system-ui, sans-serif", fontSize: 12 }}>← {h.reason}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
