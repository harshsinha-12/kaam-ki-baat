import type { ReactNode } from "react";
import { Inter, Instrument_Serif, JetBrains_Mono } from "next/font/google";

// Self-hosted at build time by next/font: Inter (UI), Instrument Serif (editorial
// accents), JetBrains Mono (evidence: SHAs, lines, sources).
const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-serif", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata = { title: "Kaam Ki Baat", description: "What was said. What was built. What was verified." };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable} ${mono.variable}`}>
      <body style={{ margin: 0, fontFamily: "var(--font-sans), ui-sans-serif, system-ui, sans-serif" }}>{children}</body>
    </html>
  );
}
