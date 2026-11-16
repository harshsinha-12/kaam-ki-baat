import type { ReactNode } from "react";
import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";

// Self-hosted at build time by next/font: Geist (UI), Instrument Serif (headlines),
// Geist Mono (evidence: SHAs, lines, sources).
const sans = Geist({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-serif", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

const title = "Kaam Ki Baat: Meeting mein bola. Repo mein bana?";
const description = "A voice teammate that remembers what your team decided, asks the leader when it doesn't know, and points to the exact line of code.";
const deploymentHost = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || (deploymentHost ? `https://${deploymentHost}` : "http://localhost:3000")),
  title: "Kaam Ki Baat",
  description,
  openGraph: {
    type: "website",
    url: "/",
    locale: "en_IN",
    siteName: "Kaam Ki Baat",
    title,
    description,
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable} ${mono.variable}`}>
      <body style={{ margin: 0, background: "#000", color: "#d4d4d4", fontFamily: "var(--font-sans), ui-sans-serif, system-ui, sans-serif" }}>{children}</body>
    </html>
  );
}
