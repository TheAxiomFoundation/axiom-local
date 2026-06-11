import type { Metadata, Viewport } from "next";
import { Courier_Prime, Fraunces, Spectral } from "next/font/google";
import "./globals.css";

// All three families are downloaded at build time and self-hosted from the
// static export — a visitor's browser talks to no font CDN. That matters
// here: the page's claim is that nothing leaves it.
const fraunces = Fraunces({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz", "WONK"],
  variable: "--font-fraunces",
  display: "swap",
});

const spectral = Spectral({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-spectral",
  display: "swap",
});

const courierPrime = Courier_Prime({
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  variable: "--font-courier",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Axiom playground — law that runs in your browser",
  description:
    "RuleSpec law encodings compiled and executed entirely in your browser by the Axiom rules engine's WebAssembly build. Your answers never leave this page.",
};

export const viewport: Viewport = {
  themeColor: "#161108",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${spectral.variable} ${courierPrime.variable}`}
    >
      <body>
        <div className="grain" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
}
