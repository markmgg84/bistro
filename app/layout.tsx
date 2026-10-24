import type { Metadata } from "next";
import "./globals.css";
import "./modern-business.css";
import "./branding.css";
import Pwa from "./pwa";
export const metadata: Metadata = {
  title: "Il pub della Maina",
  description: "Gestione Bistrò e Marina di Levante — dimostrazione",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon-192.png" },
  appleWebApp: { capable: true, title: "Il pub della Maina" },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body>
        <Pwa />
        {children}
      </body>
    </html>
  );
}

