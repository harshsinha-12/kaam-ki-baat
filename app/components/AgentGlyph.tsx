// Agent mascot: a hexagon with eyes (after the Air Agents app's agents).
// One colour per zone, used everywhere the zone appears:
//   team_memory = sky #7cc4ff · leader_desk = amber #f5c451 · code_navigator = coral #ff8a65
export const ZONE_COLOR = { team_memory: "#7cc4ff", leader_desk: "#f5c451", code_navigator: "#ff8a65" } as const;
export type GlyphZone = keyof typeof ZONE_COLOR;

export function AgentGlyph({ zone, size = 40, active = false, look = 0, reduced = true }: { zone: GlyphZone; size?: number; active?: boolean; look?: -1 | 0 | 1; reduced?: boolean }) {
  const c = ZONE_COLOR[zone];
  const dx = look * 3;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden style={{ filter: active ? `drop-shadow(0 6px 16px ${c}66)` : "none", transition: "filter .4s" }}>
      <path d="M32 6 L54 18.7 V45.3 L32 58 L10 45.3 V18.7 Z" fill={c} opacity={active ? 1 : 0.75} />
      <g style={{ transform: `translateX(${dx}px)`, transition: "transform .5s cubic-bezier(.16,1,.3,1)" }}>
        <ellipse cx="25" cy="30" rx="3.4" ry="4.6" fill="#0b0b0c">{!reduced && <animate attributeName="ry" values="4.6;4.6;0.6;4.6" keyTimes="0;.92;.96;1" dur="4.5s" repeatCount="indefinite" />}</ellipse>
        <ellipse cx="39" cy="30" rx="3.4" ry="4.6" fill="#0b0b0c">{!reduced && <animate attributeName="ry" values="4.6;4.6;0.6;4.6" keyTimes="0;.92;.96;1" dur="4.5s" repeatCount="indefinite" />}</ellipse>
      </g>
      {zone === "leader_desk" && <path d="M22 13 l5 4 5-6 5 6 5-4 -2 7 h-16 Z" fill="#0b0b0c" opacity=".55" />}
    </svg>
  );
}
