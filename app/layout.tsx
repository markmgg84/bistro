import type { Metadata } from "next";
import "./globals.css";
import Pwa from "./pwa";
export const metadata: Metadata = {
  title: "Bistrò Control",
  description: "Gestione Bistrò e Marina di Levante — dimostrazione",
  manifest: "/manifest.webmanifest",
  icons: { apple: "/icon-192.png" },
  appleWebApp: { capable: true, title: "Bistrò Control" },
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
