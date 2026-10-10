import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

/* Tipografi: satu keluarga (Geist) untuk judul dan teks, Geist Mono hanya untuk nomor/kode. */
const sans = Geist({ variable: "--font-geist", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "SEHATI · Suara Pasien, Layanan Lebih Baik", template: "%s · SEHATI" },
  description:
    "Aplikasi mandiri untuk memastikan layanan JKN yang dijanjikan diterima peserta dan masalahnya ditindaklanjuti. Seluruh data pada demo ini sintetis; bukan produk resmi BPJS Kesehatan.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${sans.variable} ${mono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
