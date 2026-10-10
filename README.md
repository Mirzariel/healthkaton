# SEHATI

Prototipe untuk BPJS Kesehatan Healthkathon 2026, kategori **Efisiensi Risiko pada Fasilitas Kesehatan**.

SEHATI memastikan layanan JKN yang dijanjikan benar-benar diterima peserta, dan masalah yang ditemukan ditindaklanjuti: survei tiga tahap + konfirmasi terarah, pembuktian oleh petugas dengan hak jawab faskes, rencana perbaikan dan tindak lanjut, semuanya tercatat di jejak audit berantai hash. AI hanya menyarankan; tidak ada pembayaran, koreksi klaim, atau sanksi otomatis.

> Seluruh nama dan angka adalah data sintetis. Bukan produk resmi BPJS Kesehatan.

## Status

Cabang ini memuat **fondasi** (skema, state machine, RBAC, jejak audit, adapter, kontrak AI v1, registry standar, cangkang konsol, beranda). Modul berikut dikerjakan terpisah di atas fondasi ini: survei dan runtime AI, ruang kasus dan portal faskes, pending/kartu/pembayaran/impor, dasbor mutu dan evaluasi. Peta lengkap: [`docs/KONTRAK-DOMAIN.md`](docs/KONTRAK-DOMAIN.md).

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

## Batas

Belum terhubung ke SIMRS, layanan resmi BPJS, atau JKN Mobile. Belum ada autentikasi nyata: pemilih peran hanya untuk demo data sintetis. Penyedia AI langsung belum diimplementasikan; yang ada kontrak dan konfigurasinya.
