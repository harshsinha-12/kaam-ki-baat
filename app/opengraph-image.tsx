import React from "react";
import { ImageResponse } from "next/og";

export const alt = "Kaam Ki Baat: Meeting mein bola. Repo mein bana? A voice teammate connecting team decisions to code.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// A public, build-time illustration of the landing page. No private evidence,
// provider requests, or remote assets are needed to render this share card.
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: "48px 56px", background: "#0b0b0c", color: "#f2efe6", fontFamily: "sans-serif", position: "relative" }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(ellipse at 85% 45%, #282014 0%, #0b0b0c 65%)" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <svg width="48" height="48" viewBox="0 0 64 64"><path d="M26.38,6.75 Q32.00,3.50 37.62,6.75 L51.93,15.00 Q57.55,18.25 57.55,24.74 L57.55,41.26 Q57.55,47.75 51.93,50.99 L37.62,59.25 Q32.00,62.50 26.38,59.26 L12.07,51.00 Q6.45,47.75 6.45,41.26 L6.45,24.74 Q6.45,18.25 12.07,15.01 Z" fill="#ffc84a" /><ellipse cx="24" cy="33.5" rx="4.4" ry="6" fill="#17130b" /><ellipse cx="40" cy="33.5" rx="4.4" ry="6" fill="#17130b" /><circle cx="25.5" cy="31" r="1.5" fill="#fff" /><circle cx="41.5" cy="31" r="1.5" fill="#fff" /></svg>
          <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: -1 }}>Kaam Ki Baat</div>
        </div>

        <div style={{ display: "flex", alignItems: "center", flex: 1, gap: 38 }}>
          <div style={{ display: "flex", flexDirection: "column", width: 655 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#9a968c", fontSize: 18, marginBottom: 22 }}>
              <div style={{ width: 8, height: 8, borderRadius: 8, background: "#6fdc8c" }} />
              Voice teammate for engineering teams
            </div>
            <div style={{ fontSize: 64, fontWeight: 700, letterSpacing: -3, lineHeight: 1.12 }}>Meeting mein bola.</div>
            <div style={{ fontSize: 64, fontWeight: 700, letterSpacing: -3, lineHeight: 1.12, color: "#f5c451" }}>Repo mein bana?</div>
            <div style={{ fontSize: 23, lineHeight: 1.5, color: "#b7b2a6", marginTop: 24, maxWidth: 600 }}>From team decisions to the exact line of code. Just ask.</div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14, width: 340 }}>
            {[
              { direction: "01 / LOOK LEFT", name: "Team Memory", detail: "What did we decide?", color: "#7cc4ff" },
              { direction: "02 / FACE FRONT", name: "Leader Desk", detail: "Ask the person who knows.", color: "#f5c451" },
              { direction: "03 / LOOK RIGHT", name: "Code Navigator", detail: "Show me the exact line.", color: "#ff8a65" },
            ].map(zone => (
              <div key={zone.name} style={{ display: "flex", flexDirection: "column", border: "1px solid #36332b", borderLeft: `3px solid ${zone.color}`, borderRadius: 16, padding: "18px 22px", background: "#121211" }}>
                <div style={{ fontSize: 11, letterSpacing: 2, color: zone.color, marginBottom: 7 }}>{zone.direction}</div>
                <div style={{ fontSize: 23, fontWeight: 700 }}>{zone.name}</div>
                <div style={{ fontSize: 15, color: "#9a968c", marginTop: 6 }}>{zone.detail}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid #302d26", paddingTop: 22 }}>
          <div style={{ fontSize: 17, color: "#9a968c" }}>What was said. What was built. What was verified.</div>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            {[12, 22, 16, 32, 44, 24, 36, 18, 28, 14].map((height, i) => (
              <div key={i} style={{ width: 5, height, borderRadius: 4, background: i < 3 ? "#7cc4ff" : i < 7 ? "#f5c451" : "#ff8a65" }} />
            ))}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
