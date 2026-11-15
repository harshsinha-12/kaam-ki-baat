import type { ReactNode } from "react";

export const metadata = { title: "Kaam Ki Baat", description: "What was said. What was built. What was verified." };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
