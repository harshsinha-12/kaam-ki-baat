// Deterministic motion engine: render(t) sets every element's state from the clock alone.
const CUES = __CUES__;
const PRS = __PRS__;
const $ = (s) => document.querySelector(s);
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, p) => a + (b - a) * p;
const outExpo = (p) => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p));
const outBack = (p) => { const c = 1.70158, c3 = c + 1; return 1 + c3 * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); };
const inOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const prog = (t, a, d) => clamp((t - a) / d);

const FX = {
  fade: () => "",
  up: (q) => `translateY(${(1 - q) * 46}px)`,
  down: (q) => `translateY(${(q - 1) * 46}px)`,
  left: (q) => `translateX(${(q - 1) * 90}px)`,
  right: (q) => `translateX(${(1 - q) * 90}px)`,
  scale: (q) => `scale(${0.9 + 0.1 * q})`,
  zoom: (q) => `scale(${1.12 - 0.12 * q})`,
  pop: (q, raw) => `scale(${0.7 + 0.3 * outBack(raw)})`,
  blur: (q) => `scale(${1.06 - 0.06 * q})`,
};
const anims = [...document.querySelectorAll(".a,.scene")].map((el) => ({
  el, tin: +el.dataset.in || 0, tout: el.dataset.out ? +el.dataset.out : 1e9,
  fx: el.dataset.fx || "fade", ofx: el.dataset.ofx || "fade",
  dur: +(el.dataset.dur || 0.6), odur: +(el.dataset.odur || 0.35),
  base: el.style.transform || "", disp: el.style.display || "", isScene: el.classList.contains("scene"),
}));
function applyAnim(a, t) {
  const { el } = a;
  if (!el.dataset.in && !a.isScene) return;
  if (t < a.tin || t >= a.tout) { el.style.display = "none"; return; }
  el.style.display = a.disp;
  const rawIn = clamp((t - a.tin) / a.dur), qi = outExpo(rawIn);
  const rawOut = clamp((t - (a.tout - a.odur)) / a.odur), qo = 1 - inOut(rawOut);
  let op = Math.min(qi, qo), tf = "", blur = 0;
  if (rawOut > 0 && qo < 1) { tf = a.ofx === "fade" ? FX[a.fx === "zoom" ? "fade" : "fade"]() : (FX[a.ofx] || FX.fade)(qo, qo); if (a.ofx === "blur") blur = (1 - qo) * 14; }
  else { tf = (FX[a.fx] || FX.fade)(qi, rawIn); if (a.fx === "blur") blur = (1 - qi) * 18; }
  el.style.opacity = op;
  if (!el.dataset.notf) el.style.transform = `${a.base} ${tf}`.trim();
  el.style.filter = blur > 0.05 ? `blur(${blur}px)` : "";
}

// ---------- builders ----------
// meeting people + idea bubbles
(() => {
  const P = $("#people");
  const ppl = [["C", "#f5c451", 200], ["H", "#7cc4ff", 700], ["+", "#ff8a65", 1200]];
  P.innerHTML = ppl.map(([l, c, x]) => `<div style="position:absolute;left:${x - 60}px;top:420px;width:120px;height:120px;border-radius:60px;background:${c}22;border:2px solid ${c};display:grid;place-items:center;font-size:48px;font-weight:800;color:${c}">${l}</div>`).join("") +
    [["Freeze code at 3:30?", 90, 130, 5.6, "#f5c451"], ["…or maybe 3:45", 260, 250, 6.4, "#f5c451"], ["Leader Desk needs a passkey", 560, 130, 7.2, "#7cc4ff"], ["Someone will own it 👍", 950, 260, 8.0, "#ff8a65"]]
      .map(([s, x, y, tin, c], i) => `<div class="idea" data-t="${tin}" style="position:absolute;left:${x}px;top:${y}px;font-size:30px;font-weight:600;padding:16px 22px;border-radius:20px 20px 20px 6px;background:#121211;border:1px solid ${c}66;white-space:nowrap">${s}</div>`).join("");
})();
// dot grid 100
$("#dots").innerHTML = Array.from({ length: 100 }, (_, i) => `<i data-i="${i}" style="display:block;width:15px;height:15px;border-radius:15px;background:#1f1e1c"></i>`).join("");
// pyramid
$("#pyr").innerHTML = [["explanation · the AI", "#b48cff", 300], ["checks", "#ff8a65", 380], ["rules", "#f5c451", 460], ["fact", "#6fdc8c", 540]]
  .map(([l, c, w], i) => `<div class="pyr" data-i="${i}" style="width:${w}px;margin:0 auto 10px 0;padding:14px 20px;border-radius:14px;background:${c}1f;border:1px solid ${c}88;color:${c};font-size:24px;font-weight:700">${l}</div>`).join("");
// workspace column bodies
$("#Lbody").innerHTML = `
  <div class="wl" data-t="69.2" data-hide="80.6" style="display:flex;gap:8px;flex-wrap:wrap"><span class="pill" style="color:var(--L);border-color:rgba(124,196,255,.4)">Wispr Flow MCP</span><span class="pill">Sprint sync · 12:30</span></div>
  <div class="wl" data-t="70.6" data-hide="80.6" style="margin-top:12px;font-size:19px;line-height:1.5;color:#cfcabe"><b style="color:var(--C)">Charan</b> “Let's freeze code around 3:30… maybe 3:45.”</div>
  <div class="wl" data-t="72.0" data-hide="80.6" style="margin-top:6px;font-size:19px;line-height:1.5;color:#cfcabe"><b style="color:var(--L)">Harsh</b> “Okay — I'll own the code navigator.”</div>
  <div class="wl" data-t="73.4" data-hide="80.6" style="margin-top:6px;font-size:19px;line-height:1.5;color:#cfcabe"><b style="color:var(--C)">Charan</b> “We'll confirm the freeze later.”</div>
  <div class="wl mono" data-t="74.6" data-hide="80.6" style="margin-top:8px;font-size:15px;color:var(--mut)">exact quotes · span 412–498 · demo meeting</div>
  <div class="wl" data-t="80.8" data-hide="98" style="position:absolute;top:0;left:0;right:0"><div class="bubble" style="margin-left:60px;background:#13212e;border:1px solid rgba(124,196,255,.4);font-size:22px" id="qL"></div></div>
  <div class="wl" data-t="82.7" data-hide="98" style="position:absolute;top:96px;left:0;right:0"><div class="bubble" style="background:#0f0f0e;border:1px solid #2a2925;font-size:22px">That was only <b style="color:var(--C)">proposed</b>, not confirmed. I won't guess — want me to ask Charan, the lead?</div>
    <div style="margin-top:10px;display:flex;gap:8px"><span class="pill" style="color:var(--C);border-color:rgba(245,196,81,.4)">state: proposed</span><span class="pill">wispr · span 412–498</span></div></div>
  <div class="wl" data-t="86.4" data-hide="98" style="position:absolute;top:296px;left:0"><span class="pill" style="color:var(--C);border-color:var(--C)">→ asked the Leader Desk</span></div>
  <div class="wl" data-t="98.2" style="position:absolute;top:0;left:0;right:0"><div class="bubble" style="background:rgba(111,220,140,.08);border:1px solid rgba(111,220,140,.4);font-size:22px">✓ <b>3:45, if CI is green</b> — approved by Charan</div>
    <div style="margin-top:10px;display:flex;gap:8px"><span class="pill" style="color:var(--ok);border-color:rgba(111,220,140,.4)">state: accepted</span><span class="pill">saved · read back</span></div></div>`;
$("#Cbody").innerHTML = `
  <div class="wl" data-t="62" data-hide="87.8" style="font-size:20px;color:var(--mut)">Only Charan's laptop can open this desk.</div>
  <div class="wl" data-t="87.8" data-hide="98" style="position:absolute;top:0;left:0;right:0"><div class="bubble" style="background:#14120a;border:1px solid rgba(245,196,81,.5);font-size:22px"><span class="mono" style="font-size:15px;color:var(--C)">NEW · from Harsh</span><br>Code freeze — 3:30 or 3:45?</div></div>
  <div class="wl" data-t="98.0" style="position:absolute;top:0;left:0;right:0"><div class="bubble" style="background:#14120a;border:1px solid rgba(245,196,81,.35);font-size:21px">Answered: <b>3:45, if CI is green</b><br><span style="color:var(--ok)">Touch ID ✓ · sent back</span></div></div>`;
$("#Rbody").innerHTML = `
  <div class="wl" data-t="62" data-hide="109" style="font-size:20px;color:var(--mut)">Ask where something lives in the code.</div>
  <div class="wl" data-t="109.05" style="position:absolute;top:0;left:0;right:0"><div class="bubble" style="margin-left:40px;background:#2a160f;border:1px solid rgba(255,138,101,.4);font-size:19px;padding:12px 16px" id="qR"></div></div>
  <div class="wl" data-t="111.9" style="position:absolute;top:92px;left:0;right:0">
    <div style="display:flex;gap:8px;flex-wrap:wrap"><span class="pill" style="color:var(--R);border-color:rgba(255,138,101,.45)">lib/core/persist-update.ts</span><span class="pill">L25 · @63317bd</span></div>
    <div class="code" style="margin-top:8px;font-size:13.5px;line-height:1.55;position:relative" id="codebox"></div>
  </div>
  <div class="wl" data-t="114.4" style="position:absolute;top:300px;left:0;right:0;display:flex;gap:8px;flex-wrap:wrap">
    <span class="pill" style="color:var(--ok);border-color:rgba(111,220,140,.4)">verify: npm test -- persist-update</span><span class="pill">match: confirmed</span><span class="pill">PR #2 · merged</span></div>
  <div class="wl" data-t="115.9" style="position:absolute;top:380px;left:0;right:0;font-size:18px;color:#d9d4c7">Next: add the <b style="color:var(--C)">3:45 freeze check</b> before the save →</div>`;
const CODE = [
  [25, "export async function persistVerifiedUpdate(args) {"],
  [36, "  const parsed = parseTaskUpdate(args.raw);"],
  [39, "  if (!args.authorizedTaskIds.has(req.taskId))"],
  [40, "    return { saved: false, reason: \"unauthorized\" };"],
  [41, "  // write once, read it back, then say \"saved\""],
];
$("#codebox").innerHTML = CODE.map(([n, s], i) => `<div class="cl" data-i="${i}"><span class="hl" style="transform:scaleX(0)"></span><i>${n}</i><span style="position:relative">${s.replace(/</g, "&lt;")}</span></div>`).join("");
// chaos fragments
(() => {
  const frags = ["where's the meeting doc?", "who owns this??", "is it merged?", "ping @lead", "notes_v3_FINAL.md", "did CI pass on latest?", "const freeze = '3:30' // ?", "which branch?", "check Slack", "git log --grep freeze", "lead is in a meeting", "TODO: confirm time"];
  $("#chaos").innerHTML = frags.map((f, i) => `<div class="frag mono" data-i="${i}" style="position:absolute;font-size:28px;padding:12px 18px;border-radius:14px;background:#0e0e0d;border:1px solid #2a2925;color:#cfcabe;white-space:nowrap">${f}</div>`).join("");
})();

// ---------- drawing helpers ----------
function headSVG(svg, yaw, w, h, scale = 1, glow = "#f2efe6") {
  const cx = w / 2, cy = h * 0.42, r = 62 * scale, ex = yaw * 26 * scale;
  svg.innerHTML = `
    <ellipse cx="${cx}" cy="${h + 40 * scale}" rx="${120 * scale}" ry="${110 * scale}" fill="#1a1917" stroke="#2c2b27"/>
    <rect x="${cx - 22 * scale}" y="${cy + r * 0.7}" width="${44 * scale}" height="${40 * scale}" fill="#1a1917"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="#24221f" stroke="#3a3832" stroke-width="2"/>
    <path d="M ${cx - r} ${cy - 6 * scale} Q ${cx + ex * 0.5} ${cy - r * 1.35} ${cx + r} ${cy - 6 * scale} Q ${cx + ex * 0.4} ${cy - r * 0.95} ${cx - r} ${cy - 6 * scale}" fill="#141312"/>
    <circle cx="${cx - 20 * scale + ex}" cy="${cy + 4 * scale}" r="${7 * scale}" fill="${glow}"/>
    <circle cx="${cx + 20 * scale + ex}" cy="${cy + 4 * scale}" r="${7 * scale}" fill="${glow}"/>
    <path d="M ${cx - 14 * scale + ex * 1.1} ${cy + 30 * scale} q ${14 * scale} ${8 * scale} ${28 * scale} 0" stroke="#5a5852" stroke-width="${3 * scale}" fill="none" stroke-linecap="round"/>
    <rect x="${cx - r - 8 * scale + ex * 0.2}" y="${cy - 8 * scale}" width="${12 * scale}" height="${26 * scale}" rx="${6 * scale}" fill="#f2efe6"/>
    <rect x="${cx + r - 4 * scale + ex * 0.2}" y="${cy - 8 * scale}" width="${12 * scale}" height="${26 * scale}" rx="${6 * scale}" fill="#f2efe6"/>`;
}
function wavePath(t, w, h, amp, freq, phase, n = 120) {
  let d = "";
  for (let i = 0; i <= n; i++) {
    const x = (i / n) * w, env = Math.sin((i / n) * Math.PI);
    const y = h / 2 + Math.sin(i * freq + t * phase) * amp * env * (0.6 + 0.4 * Math.sin(i * 0.17 + t * 3.1));
    d += `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
  }
  return d;
}
function perp(tg) { const dx = tg[0] - 960, dy = tg[1] - 650, l = Math.hypot(dx, dy); return [-dy / l * 85, dx / l * 85]; }
function keyed(t, keys) { // keys: [[time, value]] piecewise eased
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1] = keys[i], [t0, v0] = keys[i - 1];
    if (t < t1) return lerp(v0, v1, inOut(clamp((t - t0) / (t1 - t0))));
  }
  return keys[keys.length - 1][1];
}
function typeInto(el, full, t, start, dur) {
  const p = clamp((t - start) / dur); el.textContent = full.slice(0, Math.round(full.length * p)) + (p < 1 ? "▍" : "");
}
const YAW1 = [[43.6, 0], [44.2, -1], [46.4, -1], [47.0, 0], [49.4, 0], [50.0, 1]];
const YAW2 = [[65.4, 0], [66.2, -1], [87.1, -1], [87.9, 0], [105.6, 0], [106.4, 1]];
const CAM = [[79.8, [1, 960, 540]], [80.6, [1.3, 429, 610]], [86.9, [1.3, 429, 610]], [87.7, [1.24, 960, 610]], [91.2, [1.24, 960, 610]], [98.0, [1, 960, 540]], [106.6, [1, 960, 540]], [107.6, [1.3, 1491, 610]]];
function cam(t) {
  if (t <= CAM[0][0]) return CAM[0][1];
  for (let i = 1; i < CAM.length; i++) { const [t1, v1] = CAM[i], [t0, v0] = CAM[i - 1]; if (t < t1) { const p = inOut(clamp((t - t0) / (t1 - t0))); return v0.map((v, k) => lerp(v, v1[k], p)); } }
  return CAM[CAM.length - 1][1];
}
const SECTIONS = [[5, "The problem"], [19.35, "The problem · in numbers"], [31, "The idea"], [41.7, "Three zones"], [53.1, "Why it works"], [62.5, "Live walkthrough"], [65.5, "Live · Team Memory"], [87.3, "Live · Leader Desk"], [98, "Live · Code Navigator"], [118.3, "Proof"], [137, "The payoff"], [145.3, ""]];
const GLOW = [[0, [0.10, 0.05, 0.06]], [19.35, [0.05, 0.14, 0.10]], [31, [0.14, 0.06, 0.14]], [41.7, [0.16, 0.16, 0.12]], [53.1, [0.06, 0.06, 0.16]], [62.5, [0.08, 0.06, 0.06]], [118.3, [0.12, 0.12, 0.14]], [137, [0.08, 0.08, 0.10]], [145.3, [0.1, 0.12, 0.16]]];
const NOSUB = [[13.2, 19.35], [31.0, 32.95], [145.3, 154]];

function render(t) {
  for (const a of anims) applyAnim(a, t);
  // counters
  document.querySelectorAll("[data-count]").forEach((el) => { const [f, to, s, d] = el.dataset.count.split(",").map(Number); el.textContent = Math.round(lerp(f, to, outExpo(clamp((t - s) / d)))); });
  // S0 wave
  if (t < 5.2) { const w = $("#wave"); w.innerHTML = `<path d="${wavePath(t, 1920, 140, 52 * clamp(t / 1.2), 0.21, 7)}" stroke="url(#wg)" stroke-width="3" fill="none"/><defs><linearGradient id="wg"><stop offset="0" stop-color="#7cc4ff"/><stop offset=".5" stop-color="#f5c451"/><stop offset="1" stop-color="#ff8a65"/></linearGradient></defs>`; w.style.opacity = Math.min(+w.style.opacity || 0, 1) * (t > 0.9 ? 0.35 : 1); }
  // S1 ideas
  if (t > 5 && t < 13) document.querySelectorAll(".idea").forEach((el, i) => {
    const tin = +el.dataset.t, p = outBack(clamp((t - tin) / 0.5)), fade = clamp((t - 9.25) / 1.6);
    el.style.opacity = clamp((t - tin) / 0.25) * (1 - fade * 0.85);
    el.style.transform = `scale(${0.6 + 0.4 * p}) translate(${fade * (i % 2 ? 40 : -40)}px, ${fade * 30 + Math.sin(t * 1.4 + i) * 4}px)`;
    el.style.filter = `grayscale(${fade}) blur(${fade * 4}px)`;
  });
  // S2 dots + ring
  if (t > 21 && t < 27.6) {
    const n = Math.round(55 * outExpo(clamp((t - 21.6) / 1.1)));
    document.querySelectorAll("#dots i").forEach((d, i) => { d.style.background = i < n ? "#f5c451" : "#1f1e1c"; });
    $("#ring").setAttribute("stroke-dashoffset", 314 * (1 - 0.61 * outExpo(clamp((t - 25.6) / 1.1))));
  }
  // S3 architecture lines + particles
  if (t > 33 && t < 41.8) {
    const L = [[500, 330, 770, 330, 33.6, "#7cc4ff"], [1420, 330, 1150, 330, 35.4, "#6fdc8c"], [960, 600, 960, 440, 38.3, "#b48cff"]];
    let s = "";
    for (const [x1, y1, x2, y2, tin, c] of L) {
      const p = outExpo(clamp((t - tin) / 0.6)); if (p <= 0) continue;
      const xe = lerp(x1, x2, p), ye = lerp(y1, y2, p);
      s += `<line x1="${x1}" y1="${y1}" x2="${xe}" y2="${ye}" stroke="${c}" stroke-opacity=".5" stroke-width="3" stroke-dasharray="8 10" stroke-dashoffset="${-t * 40}"/>`;
      if (p >= 1) for (let k = 0; k < 3; k++) { const q = ((t * 0.8 + k / 3) % 1); s += `<circle cx="${lerp(x1, x2, q)}" cy="${lerp(y1, y2, q)}" r="7" fill="${c}" opacity="${Math.sin(q * Math.PI)}"/>`; }
    }
    $("#arch").innerHTML = s;
    if (t > 38.5) $("#vwave").innerHTML = `<path d="${wavePath(t, 400, 70, 26, 0.5, 12, 60)}" stroke="#b48cff" stroke-width="3" fill="none"/>`;
  }
  // S4 head + beam
  if (t > 41.7 && t < 53.2) {
    const y = keyed(t, YAW1); headSVG($("#head1"), y, 300, 340, 1.25);
    const tgt = y < -0.5 ? [440, 390, "#7cc4ff"] : y > 0.5 ? [1480, 390, "#ff8a65"] : t > 46.9 ? [960, 300, "#f5c451"] : null;
    const str = Math.max(Math.abs(y), t > 46.9 && t < 49.5 ? 1 : 0);
    $("#beam").innerHTML = tgt ? `<defs><linearGradient id="bg" x1="960" y1="660" x2="${tgt[0]}" y2="${tgt[1]}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${tgt[2]}" stop-opacity="0"/><stop offset="1" stop-color="${tgt[2]}" stop-opacity=".55"/></linearGradient></defs><polygon points="960,650 ${tgt[0] + perp(tgt)[0]},${tgt[1] + perp(tgt)[1]} ${tgt[0] - perp(tgt)[0]},${tgt[1] - perp(tgt)[1]}" fill="url(#bg)" opacity="${str}"/>` : "";
    document.querySelectorAll("#stage .agent").forEach((ag, i) => {
      const on = (i === 0 && y < -0.5) || (i === 2 && y > 0.5) || (i === 1 && t > 46.9 && t < 49.5);
      ag.querySelector(".hex").style.filter = on ? "drop-shadow(0 0 30px currentColor) brightness(1.15)" : t > 43.6 ? "saturate(.35) brightness(.55)" : "";
    });
  }
  // workspace
  if (t > 62.4 && t < 118.5) {
    const y = keyed(t, YAW2); headSVG($("#head2"), y, 260, 150, 0.85);
    $("#yawdot").style.left = `${(y + 1) / 2 * 1260}px`;
    const zone = y < -0.5 ? "L" : y > 0.5 ? "R" : "C";
    const col = { L: "#7cc4ff", C: "#f5c451", R: "#ff8a65" };
    for (const z of ["L", "C", "R"]) {
      const el = $("#col" + z), on = z === zone && t > 65.5;
      el.style.borderColor = on ? col[z] + "aa" : "#1f1e1c"; el.style.boxShadow = on ? `0 0 60px ${col[z]}22, inset 0 0 0 1px ${col[z]}55` : "none";
      el.style.opacity = t < 65.5 || on ? 1 : 0.42;
    }
    document.querySelectorAll(".wl").forEach((el) => {
      const tin = +el.dataset.t, hide = el.dataset.hide ? +el.dataset.hide : 1e9;
      const p = outExpo(clamp((t - tin) / 0.45)), h = clamp((t - hide) / 0.3);
      el.style.opacity = p * (1 - h); el.style.transform = `translateY(${(1 - p) * 18}px)`; if (el.dataset.disp === undefined) el.dataset.disp = el.style.display || ""; el.style.display = t < tin - 0.01 || h >= 1 ? "none" : el.dataset.disp;
    });
    typeInto($("#qL"), "Code freeze kab hai — 3:30 ya 3:45?", t, 81.0, 1.3);
    typeInto($("#qR"), "Show me exactly where this decision is saved in our code, and how we can verify it.", t, 109.2, 2.4);
    document.querySelectorAll("#codebox .hl").forEach((h, i) => { h.style.transform = `scaleX(${outExpo(clamp((t - 112.4 - i * 0.18) / 0.5))})`; h.style.opacity = i === 0 ? 1 : 0.7; });
    const [s, fx, fy] = cam(t); const sc = $("#ws").parentElement;
    sc.style.transformOrigin = "0 0"; sc.style.transform = `translate(${960 - fx * s}px, ${540 - fy * s}px) scale(${s})`;
    $("#micpill").style.opacity = 0.6 + 0.4 * Math.abs(Math.sin(t * 3));
  }
  // leader cursor + approve press
  if (t > 92.6 && t < 94) {
    const p = inOut(clamp((t - 92.7) / 0.7)); const c = $("#cursor");
    c.style.transform = `translate(${lerp(1300, 700, p)}px, ${lerp(820, 500, p)}px)`;
    $("#approve").style.transform = t > 93.45 && t < 93.65 ? "scale(.95)" : "scale(1)";
  }
  // S10 story timeline
  if (t > 119 && t < 127) {
    const x0 = 220, x1 = 1700, n = PRS.length; let s = `<line x1="${x0 - 40}" y1="150" x2="${lerp(x0 - 40, x1 + 40, outExpo(clamp((t - 119.3) / 1.2)))}" y2="150" stroke="#e9e4d6" stroke-opacity=".5" stroke-width="2"/>`;
    s += `<circle cx="${x0 - 40}" cy="150" r="8" fill="#f2efe6"/><text x="${x0 - 40}" y="200" fill="#8a877e" font-size="20" font-family="Inter" text-anchor="middle">Initial setup</text>`;
    PRS.forEach((p, i) => {
      const x = x0 + (i / (n - 1)) * (x1 - x0), tin = 119.7 + (i / n) * 5.2, q = clamp((t - tin) / 0.35);
      if (q <= 0) return;
      p.c.forEach((c, k) => { s += `<circle cx="${x}" cy="${150 + 50 + k * 26}" r="${8 * outBack(q)}" fill="${c}" opacity="${q}"/>`; });
      s += `<circle cx="${x}" cy="150" r="${11 * outBack(q)}" fill="#000" stroke="#f2efe6" stroke-width="3"/>`;
      if (i % 3 === 0 || i === n - 1) s += `<text x="${x}" y="122" fill="#8a877e" font-size="18" font-family="Inter" text-anchor="middle" opacity="${q}">#${p.n}</text>`;
      if (p.lab) s += `<text x="${x}" y="70" fill="#f2efe6" font-size="22" font-weight="700" font-family="Inter" text-anchor="middle" opacity="${q}">${p.lab}</text><line x1="${x}" y1="80" x2="${x}" y2="136" stroke="#3a3832" opacity="${q}"/>`;
    });
    $("#story").innerHTML = s;
    const m = Math.round(lerp(12 * 60 + 54, 16 * 60 + 33, outExpo(clamp((t - 119.6) / 5.4))));
    const hh = Math.floor(m / 60), mm = m % 60; $("#clock").textContent = `${hh > 12 ? hh - 12 : hh}:${String(mm).padStart(2, "0")}`;
  }
  // S11 chaos
  if (t > 137 && t < 142.8) document.querySelectorAll(".frag").forEach((el, i) => {
    const a = i * 2.39996, rr = 300 + (i % 4) * 90, ang = a + (t - 137) * 0.15 * (i % 2 ? 1 : -1);
    const pull = inOut(clamp((t - 141.6) / 1.0)), x = 960 + Math.cos(ang) * rr * 1.5 * (1 - pull), y = 470 + Math.sin(ang) * rr * 0.75 * (1 - pull);
    const ap = outBack(clamp((t - 137.2 - i * 0.22) / 0.4));
    el.style.transform = `translate(${x}px, ${y}px) translate(-50%,-50%) scale(${ap * (1 - pull * 0.8)}) rotate(${Math.sin(i) * 6}deg)`;
    el.style.opacity = clamp((t - 137.2 - i * 0.22) / 0.2) * (1 - pull);
  });
  // pyramid
  document.querySelectorAll(".pyr").forEach((el) => { const i = 3 - +el.dataset.i, q = outExpo(clamp((t - 54.8 - i * 0.45) / 0.5)); el.style.opacity = q; el.style.transform = `translateX(${(1 - q) * -40}px)`; });
  // chrome: brand, section chip, glows, subtitles, progress, fade
  $("#brand").style.opacity = t > 5 && t < 145.2 && !(t > 62.4 && t < 118.4) ? 1 : 0;
  let sec = ""; for (const [s0, l] of SECTIONS) if (t >= s0) sec = l;
  $("#secchip").textContent = sec; $("#section").style.opacity = sec ? 1 : 0;
  let gl = GLOW[0][1]; for (const [s0, g] of GLOW) if (t >= s0) gl = g;
  ["#g1", "#g3", "#g2"].forEach((id, k) => { const el = $(id); el.style.opacity = gl[k] * (0.85 + 0.15 * Math.sin(t * 0.7 + k)); el.style.transform = `translate(${Math.sin(t * 0.13 + k) * 60}px, ${Math.cos(t * 0.11 + k) * 40}px)`; });
  const cue = CUES.find(([a, b]) => t >= a && t < b);
  const hide = NOSUB.some(([a, b]) => t >= a && t < b);
  const sub = $("#sub");
  if (cue && !hide) { sub.textContent = cue[2]; sub.style.opacity = Math.min(clamp((t - cue[0]) / 0.12), clamp((cue[1] - t) / 0.12)); sub.style.display = ""; }
  else sub.style.display = "none";
  $("#prog").style.width = `${(t / 154) * 100}%`;
  $("#fade").style.opacity = Math.max(1 - clamp(t / 0.5), clamp((t - 153.2) / 0.8));
}
window.render = render;
render(+(new URLSearchParams(location.search).get("t") || 0));
