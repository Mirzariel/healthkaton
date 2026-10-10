# SEHATI

Prototipe untuk BPJS Kesehatan Healthkathon 2026, kategori **Efisiensi Risiko pada Fasilitas Kesehatan**.

SEHATI memastikan layanan JKN yang dijanjikan benar-benar diterima peserta, dan masalah yang ditemukan ditindaklanjuti: survei tiga tahap + konfirmasi terarah, pembuktian oleh petugas dengan hak jawab faskes, rencana perbaikan dan tindak lanjut, semuanya tercatat di jejak audit berantai hash. AI hanya menyarankan; tidak ada pembayaran, koreksi klaim, atau sanksi otomatis.

> Seluruh nama dan angka adalah data sintetis. Bukan produk resmi BPJS Kesehatan.

## Status

Fondasi dan keempat modul sudah terintegrasi: survei peserta dan runtime AI (`/m`, `/console/ai`), ruang kasus dan portal faskes (`/console/cases`, `/console/assistant`, `/faskes`), pending/kartu/pembayaran/impor/pra-pengajuan/dokumen bukti, dan dasbor mutu serta evaluasi AI (`/console/quality`, `/console/ai/evaluation`). AI berjalan sebagai **simulasi berlabel** sampai `ANTHROPIC_API_KEY` dipasang di server. Peta lengkap: [`docs/KONTRAK-DOMAIN.md`](docs/KONTRAK-DOMAIN.md).

## Jalankan

```bash
npm install
npm run dev        # http://localhost:3000, basis data terisi otomatis
npm test           # vitest
npm run typecheck
npm run seed       # reset data demo (saat server mati)
```

Node 22+. Basis data: `data/sehati-v2.db` (SQLite, otomatis, tidak ikut repo).

## Dokumen

- [`docs/INVENTARIS-DAN-PETA-PERUBAHAN.md`](docs/INVENTARIS-DAN-PETA-PERUBAHAN.md): baseline, reposisi, peta rute lama → baru.
- [`docs/KONTRAK-DOMAIN.md`](docs/KONTRAK-DOMAIN.md): tabel, state machine, adapter, kontrak AI, folder per modul, variabel lingkungan.
- [`docs/DEPLOY-PERSISTENSI.md`](docs/DEPLOY-PERSISTENSI.md): batas penyimpanan di Vercel dan opsinya.
- Modul: [`docs/SURVEI-AI.md`](docs/SURVEI-AI.md), [`docs/KASUS-FASKES.md`](docs/KASUS-FASKES.md), [`docs/MODUL-PENDING-KARTU-BAYAR-IMPOR.md`](docs/MODUL-PENDING-KARTU-BAYAR-IMPOR.md), [`docs/DASBOR-MUTU-EVALUASI.md`](docs/DASBOR-MUTU-EVALUASI.md).

## Batas

Belum terhubung ke SIMRS, layanan resmi BPJS, atau JKN Mobile. Belum ada autentikasi nyata: pemilih peran hanya untuk demo data sintetis. Penyedia AI langsung (Anthropic) sudah ditulis tetapi belum pernah dipanggil ke API sungguhan (tidak ada kunci saat pengembangan). Data demo kembali ke kondisi awal saat instans Vercel dingin (lihat `docs/DEPLOY-PERSISTENSI.md`).
