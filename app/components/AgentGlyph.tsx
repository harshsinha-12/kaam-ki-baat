// Agent mascot (after the Air Agents app): a soft, rounded hexagon with glossy
// eyes that blink, look toward where you are, and float a little when active.
// One colour per zone, used everywhere the zone appears (docs/design/colors.md).
export const ZONE_COLOR = { team_memory: "#7ab8ff", leader_desk: "#ffc84a", code_navigator: "#ff8c6b" } as const;
const ZONE_DEEP = { team_memory: "#2f6fc0", leader_desk: "#c98a12", code_navigator: "#c5512f" } as const;
export type GlyphZone = keyof typeof ZONE_COLOR;

// Hexagon with rounded corners: each corner is a quadratic curve through the vertex.
export function roundedHex(cx: number, cy: number, r: number, k = 0.22): string {
  const v = Array.from({ length: 6 }, (_, i) => { const a = (Math.PI / 3) * i - Math.PI / 2; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });
  const lerp = (a: number[], b: number[], t: number) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  let d = "";
  v.forEach((p, i) => {
    const prev = v[(i + 5) % 6], next = v[(i + 1) % 6];
    const a = lerp(p, prev, k), b = lerp(p, next, k);
    d += `${i ? "L" : "M"}${a[0].toFixed(2)},${a[1].toFixed(2)} Q${p[0].toFixed(2)},${p[1].toFixed(2)} ${b[0].toFixed(2)},${b[1].toFixed(2)} `;
  });
  return d + "Z";
}
export const HEX = roundedHex(32, 33, 27);

export function AgentGlyph({ zone, size = 40, active = false, look = 0, reduced = true }: { zone: GlyphZone; size?: number; active?: boolean; look?: -1 | 0 | 1; reduced?: boolean }) {
  const c = ZONE_COLOR[zone], deep = ZONE_DEEP[zone], id = `ag-${zone}`;
  const dx = look * 3.2;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden
      style={{ overflow: "visible", filter: active ? `drop-shadow(0 8px 16px ${c}40)` : "drop-shadow(0 4px 8px rgba(0,0,0,.35))", transition: "filter .5s" }}>
      <defs>
        <radialGradient id={`${id}-g`} cx="35%" cy="28%" r="80%">
          <stop offset="0" stopColor="#ffffff" stopOpacity=".55" />
          <stop offset=".35" stopColor={c} />
          <stop offset="1" stopColor={deep} />
        </radialGradient>
      </defs>
      <g>
        {active && !reduced && <animateTransform attributeName="transform" type="translate" values="0 0;0 -2.2;0 0" keyTimes="0;.5;1" calcMode="spline" keySplines=".45 0 .55 1;.45 0 .55 1" dur="3.2s" repeatCount="indefinite" />}
        <path d={HEX} fill={`url(#${id}-g)`} />
        <path d={HEX} fill="none" stroke="#fff" strokeOpacity=".18" strokeWidth="1" />
        <g style={{ transform: `translateX(${dx}px)`, transition: "transform .6s cubic-bezier(.16,1,.3,1)" }}>
          {[24, 40].map((x) => (
            <g key={x}>
              <ellipse cx={x} cy="33" rx="3.6" ry="5" fill="#141418">
                {!reduced && <animate attributeName="ry" values="5;5;0.7;5" keyTimes="0;.93;.965;1" dur="5s" repeatCount="indefinite" />}
              </ellipse>
              <circle cx={x + 1.2} cy="31" r="1.1" fill="#fff" opacity=".9" />
            </g>
          ))}
        </g>
        {zone === "leader_desk" && <path d="M24 9.5 l3.2 3.4 4.8-5 4.8 5 3.2-3.4 -1.3 6.4 h-13.4 Z" fill="#141418" opacity=".55" />}
      </g>
    </svg>
  );
}
