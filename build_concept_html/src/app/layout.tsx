import type { Metadata } from "next";
import { Instrument_Sans, JetBrains_Mono, Jost } from "next/font/google";
import "./globals.css";

const ui = Instrument_Sans({ variable: "--font-ui", subsets: ["latin"] });
const display = Jost({ variable: "--font-display-face", subsets: ["latin"], weight: ["200", "300", "400"] });
const mono = JetBrains_Mono({ variable: "--font-mono-face", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "SIOS Preview",
  description: "Interactive preview of an AI-native desktop OS: command bar, tunnel, approvals and undo.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-theme="light" className={`${ui.variable} ${display.variable} ${mono.variable} h-full`}>
      <body className="h-full">{children}</body>
    </html>
  );
}
