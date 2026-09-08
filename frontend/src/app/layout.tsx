import type { Metadata } from "next";
import { ThemeProvider } from "@/components/ThemeProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "ForensicGuard — Secure Erasure & Recovery Platform",
  description: "Integrated secure data erasure and forensic file recovery",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-page font-display text-main">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
