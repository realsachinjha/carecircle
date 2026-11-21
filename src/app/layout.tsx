import type { Metadata, Viewport } from "next";
import "./globals.css";
import { strings } from "@/strings/en";

export const metadata: Metadata = {
  title: strings.appName,
  description: strings.landing.body,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
