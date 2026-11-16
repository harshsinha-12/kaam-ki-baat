"use client";
import { useEffect, useRef } from "react";

// A live voice waveform: bars driven by a sum of sines with a syllable envelope,
// so it reads as speech (bursts and pauses), not a metronome. Idles flat.
export function VoiceWave({ active, color = "#f2efe6", bars = 18, height = 22, reduced = false }: { active: boolean; color?: string; bars?: number; height?: number; reduced?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const kids = [...el.children] as HTMLElement[];
    let raf = 0, level = 0, onScreen = true;
    // Only animate while visible and while there is something to show: an idle
    // wave settles flat and stops, so off-screen waves cost nothing.
    const tick = (now: number) => {
      raf = 0;
      const t = now / 1000;
      level += ((active ? 1 : 0) - level) * 0.12; // ease in/out
      if (!active && level < 0.01) level = 0;
      const syllable = 0.55 + 0.45 * Math.abs(Math.sin(t * 5.3)) * (0.6 + 0.4 * Math.sin(t * 1.7));
      kids.forEach((k, i) => {
        const x = i / bars;
        const v = Math.abs(Math.sin(t * 9 + i * 0.9) * 0.6 + Math.sin(t * 13.7 + i * 1.7) * 0.4) * Math.sin(Math.PI * x) * syllable;
        k.style.transform = `scaleY(${0.12 + level * v * 0.95})`;
      });
      if (!reduced && onScreen && level > 0) raf = requestAnimationFrame(tick);
    };
    const io = "IntersectionObserver" in window
      ? new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; if (onScreen && !raf) raf = requestAnimationFrame(tick); })
      : null;
    io?.observe(el);
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); io?.disconnect(); };
  }, [active, bars, reduced]);
  return (
    <div ref={ref} aria-hidden style={{ display: "inline-flex", alignItems: "center", gap: 2, height }}>
      {Array.from({ length: bars }, (_, i) => (
        <span key={i} style={{ width: 3, height, borderRadius: 3, background: color, transform: "scaleY(.12)", transformOrigin: "center", transition: "background .4s" }} />
      ))}
    </div>
  );
}
