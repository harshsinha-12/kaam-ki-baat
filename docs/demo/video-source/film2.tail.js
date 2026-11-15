// ---------- workspace bodies ----------
$("#Lbody").innerHTML = `
  <div class="wl" data-t="32.6" data-hide="35.2" style="display:flex;gap:8px;flex-wrap:wrap"><span class="pill" style="color:var(--L);border-color:rgba(124,196,255,.4)">Wispr Flow MCP</span><span class="pill">Sprint sync · exact quotes</span></div>
  <div class="wl" data-t="33.3" data-hide="35.2" style="margin-top:12px;font-size:19px;line-height:1.5;color:#cfcabe"><b style="color:var(--C)">Charan</b> “Let's freeze code around 3:30… maybe 3:45.”</div>
  <div class="wl" data-t="35.2" style="position:absolute;top:0;left:0;right:0"><div class="bubble" style="margin-left:60px;background:#13212e;border:1px solid rgba(124,196,255,.4);font-size:22px" id="qL"></div></div>
  <div class="wl" data-t="37.6" data-hide="48.6" style="position:absolute;top:96px;left:0;right:0"><div class="bubble" style="background:#0f0f0e;border:1px solid #2a2925;font-size:22px">Only <b style="color:var(--C)">proposed</b>, never confirmed. I won't guess — asking Charan, the lead.</div>
    <div style="margin-top:10px;display:flex;gap:8px"><span class="pill" style="color:var(--C);border-color:rgba(245,196,81,.4)">state: proposed</span><span class="pill">wispr · passage 11</span></div></div>
  <div class="wl" data-t="48.6" style="position:absolute;top:96px;left:0;right:0"><div class="bubble" style="background:rgba(111,220,140,.08);border:1px solid rgba(111,220,140,.4);font-size:22px">✓ <b>3:45, if CI is green</b> — approved by Charan</div></div>`;
$("#Cbody").innerHTML = `
  <div class="wl" data-t="31" data-hide="42.4" style="font-size:20px;color:var(--mut)">Only Charan's laptop can open this desk.</div>
  <div class="wl" data-t="42.4" data-hide="48.6" style="position:absolute;top:0;left:0;right:0"><div class="bubble" style="background:#14120a;border:1px solid rgba(245,196,81,.5);font-size:22px"><span class="mono" style="font-size:15px;color:var(--C)">NEW · from Harsh</span><br>Code freeze — 3:30 or 3:45?</div></div>
  <div class="wl" data-t="48.6" style="position:absolute;top:0;left:0;right:0"><div class="bubble" style="background:#14120a;border:1px solid rgba(245,196,81,.35);font-size:21px">Answered: <b>3:45, if CI is green</b><br><span style="color:var(--ok)">Touch ID ✓ · sent back</span></div></div>`;
$("#Rbody").innerHTML = `
  <div class="wl" data-t="31" data-hide="51.0" style="font-size:20px;color:var(--mut)">Ask where something lives in the code.</div>
  <div class="wl" data-t="51.0" style="position:absolute;top:0;left:0;right:0"><div class="bubble" style="margin-left:40px;background:#2a160f;border:1px solid rgba(255,138,101,.4);font-size:19px;padding:12px 16px" id="qR"></div></div>
  <div class="wl" data-t="53.0" data-hide="55.6" style="position:absolute;top:92px;left:0;right:0"><svg id="trace" width="460" height="300"></svg></div>
  <div class="wl" data-t="55.6" style="position:absolute;top:92px;left:0;right:0">
    <div style="display:flex;gap:8px;flex-wrap:wrap"><span class="pill" style="color:var(--R);border-color:rgba(255,138,101,.45)">lib/core/persist-update.ts · L25</span></div>
    <div class="code" style="margin-top:8px;font-size:13.5px;line-height:1.55;position:relative" id="codebox"></div>
    <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap"><span class="pill" style="color:var(--ok);border-color:rgba(111,220,140,.4)">verify: npm test -- persist-update</span><span class="pill">decided in meeting · passage 11</span></div>
  </div>`;
const CODE = [[25, "export async function persistVerifiedUpdate(args) {"], [36, "  const parsed = parseTaskUpdate(args.raw);"], [39, "  if (!args.authorizedTaskIds.has(req.taskId))"], [40, "    return { saved: false, reason: \"unauthorized\" };"], [41, "  // write once, read it back, then say \"saved\""]];
$("#codebox").innerHTML = CODE.map(([n, s]) => `<div class="cl"><span class="hl" style="transform:scaleX(0)"></span><i>${n}</i><span style="position:relative">${s.replace(/</g, "&lt;")}</span></div>`).join("");
// graph trace: meeting decision → PR → file → function → test
const TN = [[60, 40, "meeting · passage 11", "#7cc4ff", "freeze 3:45 approved"], [250, 40, "PR #2 · merged", "#6fdc8c", ""], [60, 150, "persist-update.ts", "#ff8a65", ""], [250, 150, "persistVerifiedUpdate()", "#ff8a65", "L25"], [155, 255, "persist-update.test.ts", "#d6e36b", "run to verify"]];
const TE = [[0, 1], [1, 2], [2, 3], [3, 4]];
const BG_N = Array.from({ length: 26 }, (_, i) => [20 + ((i * 97) % 420), 20 + ((i * 53) % 270)]);
function drawTrace(t) {
  const st = 53.1; let s = "";
  BG_N.forEach(([x, y], i) => { s += `<circle cx="${x}" cy="${y}" r="3" fill="#3a3832"/>`; if (i) s += `<line x1="${x}" y1="${y}" x2="${BG_N[i - 1][0]}" y2="${BG_N[i - 1][1]}" stroke="#1f1e1c"/>`; });
  TE.forEach(([a, b], k) => { const p = outExpo(clamp((t - st - 0.25 - k * 0.45) / 0.4)); if (p <= 0) return; const [x1, y1] = TN[a], [x2, y2] = TN[b];
    s += `<line x1="${x1 + 40}" y1="${y1}" x2="${lerp(x1 + 40, x2 + 40, p)}" y2="${lerp(y1, y2, p)}" stroke="#f5c451" stroke-width="3"/>`; });
  TN.forEach(([x, y, l, c, sub], k) => { const p = outBack(clamp((t - st - k * 0.45) / 0.35)); if (p <= 0) return;
    s += `<circle cx="${x + 40}" cy="${y}" r="${11 * p}" fill="${c}"/><circle cx="${x + 40}" cy="${y}" r="${22 * p}" fill="none" stroke="${c}" stroke-opacity="${0.4 * (1 - clamp((t - st - k * 0.45) / 1))}"/>`;
    s += `<text x="${x + 58}" y="${y + 6}" fill="#f2efe6" font-size="15" font-family="DejaVu Sans Mono" opacity="${clamp(p)}">${l}</text>`;
    if (sub) s += `<text x="${x + 58}" y="${y + 26}" fill="#8a877e" font-size="13" font-family="Inter" opacity="${clamp(p)}">${sub}</text>`; });
  $("#trace").innerHTML = s;
}
const YAW2 = [[31.4, 0], [32.0, -1], [44.3, -1], [45.0, 0], [48.6, 0], [49.2, 1]];
const CAM = [[34.9, [1, 960, 540]], [35.6, [1.3, 429, 610]], [41.4, [1.3, 429, 610]], [42.3, [1.12, 700, 600]], [45.3, [1.12, 700, 600]], [48.6, [1, 960, 540]], [49.4, [1, 960, 540]], [50.4, [1.3, 1491, 610]]];
function cam(t) { if (t <= CAM[0][0]) return CAM[0][1]; for (let i = 1; i < CAM.length; i++) { const [t1, v1] = CAM[i], [t0, v0] = CAM[i - 1]; if (t < t1) { const p = inOut(clamp((t - t0) / (t1 - t0))); return v0.map((v, k) => lerp(v, v1[k], p)); } } return CAM[CAM.length - 1][1]; }
const SECTIONS = [[2.4, "The problem"], [16.75, "The problem · in numbers"], [20.6, "How it flows"], [31.15, "Live · Team Memory"], [41.5, "Live · asks the leader"], [48.6, "Live · Code Navigator"], [57.05, "Evals"], [64.6, "The payoff"], [68.3, ""]];
const GLOW = [[0, [0.14, 0.10, 0.10]], [2.4, [0.10, 0.05, 0.06]], [16.75, [0.05, 0.14, 0.10]], [20.6, [0.14, 0.08, 0.14]], [31.15, [0.08, 0.06, 0.06]], [57.05, [0.12, 0.12, 0.14]], [68.3, [0.1, 0.12, 0.16]]];
const NOSUB = [[10.6, 16.75], [20.6, 22.6], [68.3, 74.5]];
// voice-flow geometry
const FL = [[370, 380, 500, 380, 24.4, "#7cc4ff"], [920, 380, 1060, 380, 25.2, "#f5c451"], [1390, 380, 1520, 380, 26.05, "#6fdc8c"], [1520, 420, 1390, 420, 26.6, "#6fdc8c"], [1225, 470, 1225, 610, 27.9, "#b48cff"], [1060, 700, 370, 470, 28.6, "#b48cff"]];
const TX_RAW = "umm, code freeze 3:30, nahi matlab… final time kab hai?";
function render(t) {
  for (const a of anims) applyAnim(a, t);
  document.querySelectorAll("[data-count]").forEach((el) => { const [f, to, s, d] = el.dataset.count.split(",").map(Number); el.textContent = Math.round(lerp(f, to, outExpo(clamp((t - s) / d)))); });
  if (t > 2.4 && t < 10.7) document.querySelectorAll(".idea").forEach((el, i) => {
    const tin = +el.dataset.t - 2.6, p = outBack(clamp((t - tin) / 0.5)), fade = clamp((t - 6.65) / 1.6);
    el.style.opacity = clamp((t - tin) / 0.25) * (1 - fade * 0.85);
    el.style.transform = `scale(${0.6 + 0.4 * p}) translate(${fade * (i % 2 ? 40 : -40)}px, ${fade * 30 + Math.sin(t * 1.4 + i) * 4}px)`;
    el.style.filter = `grayscale(${fade}) blur(${fade * 4}px)`;
  });
  if (t > 16.7 && t < 20.7) { const n = Math.round(55 * outExpo(clamp((t - 17.1) / 0.9))); document.querySelectorAll("#dots i").forEach((d, i) => { d.style.background = i < n ? "#f5c451" : "#1f1e1c"; }); }
  // voice flow
  if (t > 22.6 && t < 31.2) {
    let s = "";
    for (const [x1, y1, x2, y2, tin, c] of FL) {
      const p = outExpo(clamp((t - tin) / 0.5)); if (p <= 0) continue;
      const mx = (x1 + x2) / 2, my = Math.min(y1, y2) - (Math.abs(x2 - x1) > 400 ? 120 : 0);
      const d = `M${x1},${y1} Q${mx},${my} ${lerp(x1, x2, p)},${lerp(y1, y2, p)}`;
      s += `<path d="${d}" stroke="${c}" stroke-opacity=".45" stroke-width="3" fill="none" stroke-dasharray="8 10" stroke-dashoffset="${-t * 50}"/>`;
      if (p >= 1) for (let k = 0; k < 4; k++) { const q = (t * 0.9 + k / 4) % 1, a = (1 - q) * (1 - q), b = 2 * (1 - q) * q, cc = q * q; s += `<circle cx="${a * x1 + b * mx + cc * x2}" cy="${a * y1 + b * my + cc * y2}" r="6" fill="${c}" opacity="${Math.sin(q * Math.PI)}"/>`; }
    }
    $("#flow").innerHTML = s;
    const amp = 18 + 14 * Math.abs(Math.sin(t * 7));
    $("#mic").innerHTML = `<circle cx="60" cy="60" r="${44 + amp * 0.4}" fill="rgba(124,196,255,.08)"/><rect x="48" y="26" width="24" height="44" rx="12" fill="#f2efe6"/><path d="M38 58c0 14 10 22 22 22s22-8 22-22M60 80v14" stroke="#f2efe6" stroke-width="4" fill="none" stroke-linecap="round"/>`;
    const tx = $("#tx"), p = clamp((t - 24.7) / 1.6);
    if (t < 26.6) tx.innerHTML = TX_RAW.slice(0, Math.round(TX_RAW.length * p)) + (p < 1 ? "▍" : "");
    else tx.innerHTML = `<s style="color:#5a5852">umm, code freeze 3:30, nahi matlab…</s><br><span style="color:#f2efe6;background:rgba(124,196,255,.15);padding:2px 8px;border-radius:6px">final time kab hai?</span> <span style="font-size:15px;color:var(--L)">→ open decision: freeze</span>`;
    if (t > 28) $("#bw").innerHTML = `<path d="${wavePath(t, 280, 56, 20, 0.5, 12, 50)}" stroke="#b48cff" stroke-width="3" fill="none"/>`;
  }
  // workspace
  if (t > 31.1 && t < 57.1) {
    const y = keyed(t, YAW2); headSVG($("#head2"), y, 260, 150, 0.85);
    $("#yawdot").style.left = `${(y + 1) / 2 * 1260}px`;
    const zone = y < -0.5 ? "L" : y > 0.5 ? "R" : "C", col = { L: "#7cc4ff", C: "#f5c451", R: "#ff8a65" };
    for (const z of ["L", "C", "R"]) { const el = $("#col" + z), on = z === zone && t > 31.9; el.style.borderColor = on ? col[z] + "aa" : "#1f1e1c"; el.style.boxShadow = on ? `0 0 60px ${col[z]}22, inset 0 0 0 1px ${col[z]}55` : "none"; el.style.opacity = t < 31.9 || on || (z === "C" && t > 42 && t < 45) ? 1 : 0.42; }
    document.querySelectorAll(".wl").forEach((el) => { const tin = +el.dataset.t, hide = el.dataset.hide ? +el.dataset.hide : 1e9; const p = outExpo(clamp((t - tin) / 0.45)), h = clamp((t - hide) / 0.3);
      if (el.dataset.disp === undefined) el.dataset.disp = el.style.display || ""; el.style.opacity = p * (1 - h); el.style.transform = `translateY(${(1 - p) * 18}px)`; el.style.display = t < tin - 0.01 || h >= 1 ? "none" : el.dataset.disp; });
    typeInto($("#qL"), "Code freeze kab hai — 3:30 ya 3:45?", t, 35.3, 1.2);
    typeInto($("#qR"), "Show me exactly where this decision is saved in our code, and how we can verify it.", t, 51.1, 1.9);
    if (t > 53 && t < 55.8) drawTrace(t);
    document.querySelectorAll("#codebox .hl").forEach((h, i) => { h.style.transform = `scaleX(${outExpo(clamp((t - 55.9 - i * 0.15) / 0.45))})`; h.style.opacity = i === 0 ? 1 : 0.7; });
    // escalation packet L → C
    const ep = clamp((t - 41.0) / 1.3); let es = "";
    if (t > 40.9 && t < 42.8) { const x1 = 280, y1 = 420, x2 = 810, y2 = 360, mx = 545, my = 230, q = inOut(ep), a = (1 - q) ** 2, b = 2 * (1 - q) * q, c = q * q;
      es = `<path d="M${x1},${y1} Q${mx},${my} ${x2},${y2}" stroke="#f5c451" stroke-opacity=".5" stroke-width="3" stroke-dasharray="8 10" fill="none"/><circle cx="${a * x1 + b * mx + c * x2}" cy="${a * y1 + b * my + c * y2}" r="14" fill="#f5c451" style="filter:drop-shadow(0 0 12px #f5c451)"/><text x="${a * x1 + b * mx + c * x2 + 22}" y="${a * y1 + b * my + c * y2 - 16}" fill="#f5c451" font-size="20" font-family="Inter" font-weight="700">asking the lead…</text>`; }
    $("#esc").innerHTML = es;
    const [s, fx, fy] = cam(t), sc = $("#ws").parentElement; sc.style.transformOrigin = "0 0"; sc.style.transform = `translate(${960 - fx * s}px, ${540 - fy * s}px) scale(${s})`;
    $("#micpill").style.opacity = 0.6 + 0.4 * Math.abs(Math.sin(t * 3));
  }
  if (t > 45.8 && t < 46.8) { const p = inOut(clamp((t - 45.9) / 0.5)); $("#cursor").style.transform = `translate(${lerp(1300, 760, p)}px, ${lerp(860, 430, p)}px)`; $("#approve").style.transform = t > 46.35 && t < 46.55 ? "scale(.95)" : "scale(1)"; }
  if (t > 57 && t < 64.7) { $("#b1").style.width = `${46 * outExpo(clamp((t - 57.8) / 1.2))}%`; $("#b2").style.width = `${93 * outExpo(clamp((t - 58.1) / 1.4))}%`;
    ["#d1", "#d2", "#d3"].forEach((id, k) => { $(id).style.opacity = clamp((t - 60.0 - k * 0.3) / 0.25); }); $("#fixpill").style.opacity = clamp((t - 59.4) / 0.3); }
  $("#brand").style.opacity = t > 2.4 && t < 68.2 && !(t > 31.1 && t < 57.1) ? 1 : 0;
  let sec = ""; for (const [s0, l] of SECTIONS) if (t >= s0) sec = l; $("#secchip").textContent = sec; $("#section").style.opacity = sec ? 1 : 0;
  let gl = GLOW[0][1]; for (const [s0, g] of GLOW) if (t >= s0) gl = g;
  ["#g1", "#g3", "#g2"].forEach((id, k) => { const el = $(id); el.style.opacity = gl[k] * (0.85 + 0.15 * Math.sin(t * 0.7 + k)); el.style.transform = `translate(${Math.sin(t * 0.13 + k) * 60}px, ${Math.cos(t * 0.11 + k) * 40}px)`; });
  const cue = CUES.find(([a, b]) => t >= a && t < b), hide = NOSUB.some(([a, b]) => t >= a && t < b), sub = $("#sub");
  if (cue && !hide) { sub.textContent = cue[2]; sub.style.opacity = Math.min(clamp((t - cue[0]) / 0.12), clamp((cue[1] - t) / 0.12)); sub.style.display = ""; } else sub.style.display = "none";
  $("#prog").style.width = `${(t / 74.5) * 100}%`;
  $("#fade").style.opacity = Math.max(1 - clamp(t / 0.15), clamp((t - 74.1) / 0.4));
}
window.render = render;
render(+(new URLSearchParams(location.search).get("t") || 0));
