import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";

/* Tipografi: satu keluarga (Inter, dengan sumbu optical size) untuk judul dan teks; Geist Mono hanya untuk nomor/kode. */
const sans = Inter({ variable: "--font-inter", subsets: ["latin"], axes: ["opsz"], display: "swap" });
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
