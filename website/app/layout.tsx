import type { Metadata } from "next";
import "./globals.css";
import { siteDescription, siteTitle, siteUrl } from "./site";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: siteTitle,
  description: siteDescription,
  alternates: { canonical: "/" },
  icons: { icon: "/localsubs-logo.png", shortcut: "/localsubs-logo.png" },
  openGraph: {
    title: siteTitle,
    description: siteDescription,
    url: siteUrl,
    siteName: "LocalSubs",
    type: "website",
    locale: "zh_TW",
    images: [{ url: "/og-theater.png", width: 1200, height: 630, alt: "LocalSubs：英文字幕上面，多一行台灣中文。" }],
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
    images: ["/og-theater.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-Hant-TW"><body>{children}</body></html>;
}
