import type { Metadata } from "next";
import { Newsreader, Source_Sans_3, Geist_Mono } from "next/font/google";
import "./globals.css";
import Providers from "./components/Providers";

// "Lamplight" type system (docs/DESIGN.md): Newsreader is the serif voice of
// the content, Source Sans 3 is quiet UI chrome, Geist Mono renders data.
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

const sourceSans = Source_Sans_3({
  variable: "--font-source-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Deepscroll",
  description: "Replace doomscrolling with valuable content.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${newsreader.variable} ${sourceSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
