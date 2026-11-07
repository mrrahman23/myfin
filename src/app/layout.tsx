import type { Metadata, Viewport } from "next";
import { InlineScript } from "@/components/inline-script";
import { themeScript } from "@/lib/theme-script";
import { appleSplashScreens } from "@/lib/pwa";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "myFin", template: "%s · myFin" },
  description: "Personal finance and cash-flow management",
  applicationName: "myFin",
  appleWebApp: {
    capable: true,
    title: "myFin",
    statusBarStyle: "default",
    startupImage: appleSplashScreens(),
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/favicon.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  other: { "mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f2f2f7",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <InlineScript html={themeScript} />
      </head>
      <body>{children}</body>
    </html>
  );
}
