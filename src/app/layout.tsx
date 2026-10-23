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
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-white.png", sizes: "256x256", type: "image/png" },
      { url: "/logo-white.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${space.variable} h-full`}>
      <body className="min-h-full bg-black text-neutral-100 antialiased font-[family-name:var(--font-space)] dark">
        {children}
      </body>
    </html>
  );
}
