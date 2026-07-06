import type { Metadata } from "next";
import {
  Newsreader,
  Source_Sans_3,
  Geist_Mono,
  Cinzel,
  Playfair_Display,
  EB_Garamond,
  Zilla_Slab,
  Inter,
  Poppins,
} from "next/font/google";
import "./globals.css";
import "katex/dist/katex.min.css";
import Providers from "@/components/Providers";

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

// Cover title typefaces. A baked book cover SVG (IMAGE_STANDARD.md section 8)
// reproduces the real cover's lettering with the closest of these free fonts,
// referenced as a CSS var via style="font-family: var(--font-...)". Only the
// typeface (not protected) is borrowed, never a specific commercial face. This is
// an extensible set: when no loaded font is close enough to a real cover, add the
// nearest free Google font here as a new --font-* var and use it. Cinzel is the
// inscriptional Roman-capital default (renders capitals by design).
// All namespaced under --font-cover-* so none collides with a Tailwind theme
// token (e.g. --font-sans).
const coverSerif = Cinzel({ variable: "--font-cover-serif", subsets: ["latin"] });
const coverDidone = Playfair_Display({ variable: "--font-cover-didone", subsets: ["latin"] });
const coverGaramond = EB_Garamond({ variable: "--font-cover-garamond", subsets: ["latin"] });
const coverSlab = Zilla_Slab({
  variable: "--font-cover-slab",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});
const coverSans = Inter({ variable: "--font-cover-sans", subsets: ["latin"] });
const coverGeometric = Poppins({
  variable: "--font-cover-geometric",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
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
      className={`${newsreader.variable} ${sourceSans.variable} ${geistMono.variable} ${coverSerif.variable} ${coverDidone.variable} ${coverGaramond.variable} ${coverSlab.variable} ${coverSans.variable} ${coverGeometric.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
