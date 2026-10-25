import type { Metadata, Viewport } from "next";
import { Space_Grotesk } from "next/font/google";
import "./globals.css";

const space = Space_Grotesk({
  variable: "--font-space",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
};

export const metadata: Metadata = {
  title: "MR AI",
  description: "AI assistant by Muhammadrasul",
  // Exactly one <link rel="icon">, pointing at the SVG — deliberately not favicon.ico too. With both
  // files present Next's own convention only auto-links the .ico one (icon.svg silently dropped), and
  // declaring both here produced three competing tags, so whichever one a given browser preferred (not
  // necessarily the same one twice) is the one that actually showed — and the one the dynamic status
  // favicon (useFaviconStatus) updates needs to be that SAME one, deterministically, every time.
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${space.variable} h-full`}>
      <body className="min-h-full bg-black text-neutral-100 antialiased dark">
        {children}
      </body>
    </html>
  );
}
