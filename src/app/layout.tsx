import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "LawAI", template: "%s · LawAI" },
  description: "AI-native practice management for law firms.",
};
export const viewport: Viewport = { themeColor: "#0f1729" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Public+Sans:wght@400;500;600;700&family=Schibsted+Grotesk:wght@500;600;700;800&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap"
        />
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><rect width='24' height='24' rx='6' fill='%232b44d6'/><path d='M12 5v14M8 19h8M5 8h14M7 8l-2 5a2 2 0 004 0zM17 8l-2 5a2 2 0 004 0z' stroke='white' stroke-width='1.6' fill='none' stroke-linecap='round' stroke-linejoin='round'/></svg>" />
      </head>
      <body>{children}</body>
    </html>
  );
}
