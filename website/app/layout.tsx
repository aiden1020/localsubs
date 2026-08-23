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
    images: [{ url: "/og-warm.png", width: 1727, height: 910, alt: "LocalSubs：完全免費，在 HBO Max 看原文也跟得上劇情。" }],
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
    images: ["/og-warm.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-Hant-TW"><body>{children}</body></html>;
}
