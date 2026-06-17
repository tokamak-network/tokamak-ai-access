import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";

// Font is loaded via globals.css @import (Google Fonts) to match
// the Asymmetric Editorial Split pattern spec exactly.

export const metadata: Metadata = {
  title: "TON AI Access",
  description: "Stake ≥ 100 TON on Tokamak Network → Get your AI API key",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
