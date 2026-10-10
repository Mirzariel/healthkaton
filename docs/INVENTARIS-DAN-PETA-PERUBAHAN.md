# Inventaris prototipe lama dan peta perubahan

Dibuat dari pembacaan repositori pada commit `8976710` (baseline) dan hasil fondasi di cabang ini. Hal yang tidak diverifikasi ditandai.

## 1. Baseline (FAKTA dari repositori)

- Next 16 App Router, React 19, Tailwind 4, SQLite lewat `better-sqlite3`, vitest. Deploy Vercel (`vercel.json`, framework nextjs), basis data di `/tmp`.
- Tiga permukaan: `/` (halaman produk + cerita Bu Sari), `/m` (aplikasi peserta), `/console` (konsol petugas).
- Mesin deteksi berbasis aturan (`src/lib/engine`): tiga pola, dengan istilah "tagihan fiktif (phantom billing)", "tagihan ganda", "pemecahan episode", dan memosisikan peserta sebagai "saksi".
- **Autopilot** (`src/lib/autopilot.ts`): memutus kasus otomatis (lolos/koreksi/tolak), eksekusi massal, kebijakan "semua keputusan otomatis". Tes di `tests/autopilot`, `tests/engine`.
- Jejak audit hash berantai (`src/lib/audit.ts`), impor CSV, metrik dari label kebenaran, penjelas istilah.
- Tidak ada autentikasi nyata; pengalih peran hanya demo.
- Baseline tes yang dijalankan sebelum perubahan: TIDAK dicatat dalam sesi ini (konteks awal terpotong). Riwayat git tetap memuat tes lama.

## 2. Reposisi (sesuai master prompt 9 Okt 2026)

Dari "mendeteksi dan memutus kecurangan" menjadi "memastikan layanan yang dijanjikan benar-benar diterima dan masalahnya ditindaklanjuti". Konsekuensi:

| Aspek | Lama | Baru |
|---|---|---|
| Peserta | saksi / sumber bukti kecurangan | penerima layanan; jawaban "tidak tahu/tidak paham" bernilai 0 |
| Istilah | fiktif, ganda, pemecahan | "dokumentasi pelaksanaan belum ditemukan", "kandidat tagihan berulang", "kandidat perawatan lanjutan" (`labels.ts`) |
| Keputusan | Autopilot memutus otomatis | Sinyal → pembuktian oleh petugas (hak jawab faskes, reviewer menyetujui). AI hanya menyarankan |
| Penyebab | dihitung otomatis | hanya setelah terbukti; dugaan fraud butuh dua persetujuan beda peran |
| Klaim | autopilot dapat menolak/mengoreksi | tidak ada kode yang mengubah klaim; peninjauan klaim dicatat sebagai simulasi |
| Survei | satu konfirmasi layanan | tiga tahap + konfirmasi terarah (modul survei-ai) |
| Standar | tidak ada | registry berversi, bersumber, dengan alur tinjauan |

## 3. Peta rute lama → baru

| Lama | Nasib | Baru / pemilik |
|---|---|---|
| `/` | diganti | Beranda baru (fondasi) |
| `/m` | belum ada | Aplikasi peserta baru (survei-ai) |
| `/console` | diganti | Ringkasan dari data nyata (fondasi) |
| `/console/cases/[id]` | dibangun ulang | Ruang kasus `/console/cases/[id]` (kasus-faskes) |
| `/console/autopilot` | **dihapus** | `/console/assistant` peninjauan berbantuan AI (kasus-faskes). Redirect didokumentasikan saat modul masuk |
| `/console/precheck` | dibangun ulang | `/console/precheck` (pending-kartu-bayar-impor) |
| `/console/import` | dibangun ulang | `/console/import` (pending-kartu-bayar-impor); logika CSV lama ada di riwayat git (`src/lib/csv.ts`) |
| `/console/metrics` | dibangun ulang | `/console/quality` (dasbor-evaluasi) |
| `/console/audit`, `/console/audit/report` | audit: diganti; laporan cetak belum | `/console/audit` (fondasi); laporan cetak menyusul |
| `/api/autopilot/*`, `/api/cases/[id]/auto`, `/api/patient/confirm` | **dihapus** | tidak ada padanan otomatis; konfirmasi peserta menjadi survei terarah |
| `/api/cases/[id]/{assign,decide,message}`, `/api/import*` | dibangun ulang | modul pemilik masing-masing; `/api/reset` dan `/api/session` ada di fondasi |
| *(baru)* `/console/standards`, `/api/standards/*`, `/api/audit/verify` | baru | fondasi |

Berkas lama yang dihapus (masih ada di riwayat git): `autopilot.ts`, `engine/*`, `queries.ts`, `actions.ts`, `story.ts`, `components/{m,story,console,audit}/*`, tes lama. Detektor diport ke `src/lib/cases/signals.ts` dengan bahasa netral.

## 4. Yang dipertahankan

Tautan episode, linimasa, rekonsiliasi, klarifikasi, penugasan, impor, pra-pengajuan, dan audit tetap menjadi kemampuan inti; di fondasi sudah ada sebagai skema + fungsi domain (episode/klaim, `evidence_searches`, `clarifications`, `assignments`, `audit_log`). UI-nya dibangun modul pemilik.

## 5. Catatan kejujuran

- Parameter pembayaran (jatuh tempo 15 hari) dan kartu faskes berstatus **DEMO/draft** di `policy_versions`; bukan aturan resmi.
- Sumber E1–E10 dalam master prompt belum dibuka; tercatat "menunggu validasi". L4–L6 tidak dilampirkan dan tidak ditebak.
- Penyedia AI langsung belum ditulis; hanya kontrak dan konfigurasi.
- Lookalike T1 masih tertandai sebagai sinyal sampai konfirmasi terarah diseed oleh modul survei.
