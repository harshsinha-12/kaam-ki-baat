"use client";
import { useEffect, useId, useRef } from "react";
import { HEX } from "./AgentGlyph";

// The Kaam Ki Baat mark: the amber agent from the demo film. A soft, glossy
// hexagon with two eyes that blink now and then. With `track`, the pupils
// follow the pointer a few pixels, so the logo is looking at what you look at.
export function BrandMark({ size = 28, track = false, blink = true }: { size?: number; track?: boolean; blink?: boolean }) {
  const id = useId().replace(/:/g, "");
  const eyes = useRef<SVGGElement>(null);
  useEffect(() => {
    if (!track || !eyes.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = eyes.current;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const svg = el.ownerSVGElement?.getBoundingClientRect();
        if (!svg) return;
        const dx = e.clientX - (svg.left + svg.width / 2), dy = e.clientY - (svg.top + svg.height / 2);
        const d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / 260);
        el.style.transform = `translate(${((dx / d) * 3.4 * k).toFixed(2)}px, ${((dy / d) * 2.4 * k).toFixed(2)}px)`;
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => { window.removeEventListener("pointermove", onMove); cancelAnimationFrame(raf); };
  }, [track]);
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden style={{ flex: "none", overflow: "visible" }}>
      <defs>
        <radialGradient id={`${id}-b`} cx="34%" cy="24%" r="85%">
          <stop offset="0" stopColor="#fff6d6" />
          <stop offset=".28" stopColor="#ffd25e" />
          <stop offset=".72" stopColor="#f5b52a" />
          <stop offset="1" stopColor="#c98a12" />
        </radialGradient>
        <linearGradient id={`${id}-r`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".55" />
          <stop offset=".5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={HEX} fill={`url(#${id}-b)`} />
      <path d={HEX} fill="none" stroke={`url(#${id}-r)`} strokeWidth="1.4" />
      <g ref={eyes} style={{ transition: "transform .35s cubic-bezier(.16,1,.3,1)" }}>
        {[24.5, 39.5].map((x) => (
          <g key={x}>
            <ellipse cx={x} cy="33.5" rx="4" ry="5.6" fill="#17130b">
              {blink && <animate attributeName="ry" values="5.6;5.6;.6;5.6" keyTimes="0;.94;.97;1" dur="5.2s" repeatCount="indefinite" />}
            </ellipse>
            <circle cx={x + 1.4} cy="31.2" r="1.35" fill="#fff" opacity=".95" />
          </g>
        ))}
      </g>
    </svg>
  );
}

// The same mark as a static string, for places that need raw SVG.
export const BRAND_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><radialGradient id="b" cx="34%" cy="24%" r="85%"><stop offset="0" stop-color="#fff6d6"/><stop offset=".28" stop-color="#ffd25e"/><stop offset=".72" stop-color="#f5b52a"/><stop offset="1" stop-color="#c98a12"/></radialGradient></defs><path d="${HEX}" fill="url(#b)"/><ellipse cx="24.5" cy="33.5" rx="4" ry="5.6" fill="#17130b"/><ellipse cx="39.5" cy="33.5" rx="4" ry="5.6" fill="#17130b"/><circle cx="25.9" cy="31.2" r="1.35" fill="#fff"/><circle cx="40.9" cy="31.2" r="1.35" fill="#fff"/></svg>`;
