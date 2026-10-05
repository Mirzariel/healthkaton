import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

/* Tipografi korporat: satu keluarga (Geist) untuk judul & teks, Geist Mono hanya untuk nomor/kode. */
const sans = Geist({ variable: "--font-geist", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "SEHATI · Satu episode, satu kebenaran",
  description:
    "Prototipe konsep untuk Healthkathon 2026: pemeriksaan integritas klaim fasilitas kesehatan JKN dari prapengajuan sampai audit. Seluruh data adalah simulasi.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className={`${sans.variable} ${mono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
