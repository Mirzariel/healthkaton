import type { Role } from "./auth/principal";

/* Registri navigasi. Setiap modul menambahkan barisnya sendiri dan membalik `ready` menjadi true BERSAMAAN dengan halamannya.
   Item `ready: false` tidak ditampilkan di UI (tidak ada menu "segera hadir"), tetapi tetap tercatat di sini sebagai peta rute akhir. */
export interface NavItem {
  href: string;
  label: string;
  group: "Kerja" | "Standar dan AI" | "Mutu dan keuangan" | "Sistem";
  roles: Role[] | "all";
  ready: boolean;
  /** Modul/utas yang memiliki rute ini. */
  owner: "fondasi" | "survei-ai" | "kasus-faskes" | "pending-kartu-bayar-impor" | "dasbor-evaluasi";
  note?: string;
}

const INTERNAL: Role[] = ["verifikator", "reviewer", "auditor", "admin"];

export const CONSOLE_NAV: NavItem[] = [
  { href: "/console", label: "Ringkasan", group: "Kerja", roles: "all", ready: true, owner: "fondasi" },
  { href: "/console/cases", label: "Antrean kasus", group: "Kerja", roles: ["verifikator", "reviewer", "auditor", "admin"], ready: true, owner: "kasus-faskes", note: "Antrean pembuktian dan antrean tindakan perbaikan dipisah." },
  { href: "/console/assistant", label: "Asisten AI (peninjauan)", group: "Kerja", roles: ["verifikator", "reviewer", "admin"], ready: true, owner: "kasus-faskes", note: "Menggantikan /console/autopilot (redirect terdokumentasi). AI hanya menyarankan." },
  { href: "/console/precheck", label: "Pra-pengajuan", group: "Kerja", roles: ["verifikator", "reviewer", "admin"], ready: true, owner: "pending-kartu-bayar-impor" },
  { href: "/console/documents", label: "Dokumen bukti", group: "Kerja", roles: ["verifikator", "reviewer", "admin"], ready: true, owner: "pending-kartu-bayar-impor", note: "Unggah, ekstraksi teks PDF, transkripsi manual, tinjauan usulan." },
  { href: "/console/pending", label: "Pemilahan pending", group: "Kerja", roles: ["verifikator", "reviewer", "admin"], ready: true, owner: "pending-kartu-bayar-impor" },
  { href: "/console/import", label: "Impor data", group: "Kerja", roles: ["admin"], ready: true, owner: "pending-kartu-bayar-impor" },
  { href: "/console/standards", label: "Registry standar", group: "Standar dan AI", roles: INTERNAL, ready: true, owner: "fondasi" },
  { href: "/console/ai", label: "Dasbor AI", group: "Standar dan AI", roles: ["verifikator", "reviewer", "auditor", "admin"], ready: true, owner: "survei-ai", note: "Riwayat sesi, jejak turn, sumber standar, operasional model, konfigurasi, sandbox. Evaluasi: dasbor-evaluasi." },
  { href: "/console/ai/evaluation", label: "Evaluasi AI", group: "Standar dan AI", roles: ["reviewer", "auditor", "admin"], ready: false, owner: "dasbor-evaluasi" },
  { href: "/console/quality", label: "Dasbor mutu", group: "Mutu dan keuangan", roles: INTERNAL, ready: false, owner: "dasbor-evaluasi" },
  { href: "/console/cards", label: "Kartu pembinaan faskes", group: "Mutu dan keuangan", roles: INTERNAL, ready: true, owner: "pending-kartu-bayar-impor" },
  { href: "/console/payments", label: "Dasbor pembayaran", group: "Mutu dan keuangan", roles: INTERNAL, ready: true, owner: "pending-kartu-bayar-impor" },
  { href: "/console/audit", label: "Jejak audit", group: "Sistem", roles: ["reviewer", "auditor", "admin"], ready: true, owner: "fondasi" },
];

export const SURFACES = [
  { href: "/m", label: "Aplikasi peserta", owner: "survei-ai", ready: true },
  { href: "/faskes", label: "Portal faskes", owner: "kasus-faskes", ready: true },
  { href: "/console", label: "Konsol petugas", owner: "fondasi", ready: true },
] as const;

export function navFor(role: Role) {
  return CONSOLE_NAV.filter((n) => n.ready && (n.roles === "all" || n.roles.includes(role)));
}
