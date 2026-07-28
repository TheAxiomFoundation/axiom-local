import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";

// Both families are downloaded at build time and self-hosted from the
// static export — a visitor's browser talks to no font CDN. That matters
// here: the page's claim is that nothing leaves it. The variable names are
// the ones @axiom-foundation/ui's tokens expect.
const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Axiom local — law that runs in your browser",
  description:
    "RuleSpec law encodings compiled and executed entirely in your browser by the Axiom rules engine's WebAssembly build. Your answers never leave this page.",
};

export const viewport: Viewport = {
  themeColor: "#faf9f6",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        {children}
        <Script
          async
          src="https://www.googletagmanager.com/gtag/js?id=G-5PB7KEWV38"
        />
        <Script id="ga-init">
          {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)};gtag("js",new Date());gtag("config","G-5PB7KEWV38");`}
        </Script>
      </body>
    </html>
  );
}
