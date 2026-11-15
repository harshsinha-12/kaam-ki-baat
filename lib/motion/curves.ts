// Motion maths for the UI, after Freya Holmér's "Lerp smoothing is broken" and
// "The Continuity of Splines". Pure functions; used by the landing page and tested.

export type V2 = { x: number; y: number };
const add = (a: V2, b: V2): V2 => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: V2, k: number): V2 => ({ x: a.x * k, y: a.y * k });
const sub = (a: V2, b: V2): V2 => ({ x: a.x - b.x, y: a.y - b.y });
export const len = (a: V2) => Math.hypot(a.x, a.y);

/** Frame-rate independent smoothing: move from a toward b by exponential decay. */
export function damp(a: number, b: number, decay: number, dt: number): number {
  return b + (a - b) * Math.exp(-decay * dt);
}

/** Cubic Bézier point and first/second derivatives (Bernstein form). */
export function bezier(p0: V2, p1: V2, p2: V2, p3: V2, t: number): V2 {
  const u = 1 - t;
  return add(add(mul(p0, u * u * u), mul(p1, 3 * u * u * t)), add(mul(p2, 3 * u * t * t), mul(p3, t * t * t)));
}
export function bezierD1(p0: V2, p1: V2, p2: V2, p3: V2, t: number): V2 {
  const u = 1 - t;
  return add(add(mul(sub(p1, p0), 3 * u * u), mul(sub(p2, p1), 6 * u * t)), mul(sub(p3, p2), 3 * t * t));
}
export function bezierD2(p0: V2, p1: V2, p2: V2, p3: V2, t: number): V2 {
  return add(mul(add(sub(p2, mul(p1, 2)), p0), 6 * (1 - t)), mul(add(sub(p3, mul(p2, 2)), p1), 6 * t));
}

/** Catmull-Rom through points → cubic Bézier segments (C1: velocity matches at joints). */
export function catmullRomToBezier(pts: V2[]): [V2, V2, V2, V2][] {
  const segs: [V2, V2, V2, V2][] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    segs.push([p1, add(p1, mul(sub(p2, p0), 1 / 6)), sub(p2, mul(sub(p3, p1), 1 / 6)), p2]);
  }
  return segs;
}

/** Uniform cubic B-spline control points → Bézier segments (C2: acceleration matches too). */
export function bsplineToBezier(c: V2[]): [V2, V2, V2, V2][] {
  const segs: [V2, V2, V2, V2][] = [];
  for (let i = 0; i + 3 < c.length; i++) {
    const [a, b, d, e] = [c[i], c[i + 1], c[i + 2], c[i + 3]];
    const p1 = add(mul(b, 2 / 3), mul(d, 1 / 3)), p2 = add(mul(b, 1 / 3), mul(d, 2 / 3));
    const p0 = mul(add(add(a, mul(b, 4)), d), 1 / 6), p3 = mul(add(add(b, mul(d, 4)), e), 1 / 6);
    segs.push([p0, p1, p2, p3]);
  }
  return segs;
}

export const toSvgPath = (segs: [V2, V2, V2, V2][]) =>
  segs.map((s, i) => `${i ? "" : `M${s[0].x},${s[0].y} `}C${s[1].x},${s[1].y} ${s[2].x},${s[2].y} ${s[3].x},${s[3].y}`).join(" ");

/** Arc-length table so a dot moves at constant speed along the whole spline. */
export function arcLength(segs: [V2, V2, V2, V2][], samples = 32) {
  const table: { s: number; seg: number; t: number }[] = [{ s: 0, seg: 0, t: 0 }];
  let total = 0, prev = segs[0][0];
  segs.forEach((seg, i) => {
    for (let k = 1; k <= samples; k++) {
      const p = bezier(...seg, k / samples);
      total += len(sub(p, prev)); prev = p;
      table.push({ s: total, seg: i, t: k / samples });
    }
  });
  /** point at fraction u ∈ [0,1] of the total length */
  const at = (u: number): V2 => {
    const target = Math.max(0, Math.min(1, u)) * total;
    let lo = 0, hi = table.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (table[mid].s < target) lo = mid + 1; else hi = mid; }
    const b = table[lo], a = table[Math.max(0, lo - 1)];
    const f = b.s === a.s ? 0 : (target - a.s) / (b.s - a.s);
    const seg = b.seg === a.seg ? b.seg : b.seg;
    const t = b.seg === a.seg ? a.t + (b.t - a.t) * f : b.t * f;
    return bezier(...segs[seg], t);
  };
  return { total, at };
}
