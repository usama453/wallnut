import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Proof — Marketing Asset Quality Gate",
  description:
    "AI-powered proofreading and QA for marketing assets. Catch mistakes before you publish or print.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
