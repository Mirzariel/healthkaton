# SEHATI

Prototipe konsep untuk BPJS Kesehatan Healthkathon 2026, kategori **Efisiensi Risiko pada Fasilitas Kesehatan**.

SEHATI menyatukan semua klaim rumah sakit ke **satu episode pasien**, sehingga tiga pola kecurangan terlihat: tagihan fiktif (*phantom billing*), tagihan ganda (*repeat billing*), dan perawatan yang dipecah (*pemecahan episode*). Peserta menjadi saksi lewat aplikasi, petugas melihat bukti berdampingan, dan **Autopilot** memutus kasus rutin secara otomatis. Semua langkah tercatat di jejak audit yang tidak bisa diubah diam-diam.

> Seluruh nama dan angka adalah data contoh, bukan data peserta JKN. Bukan produk resmi BPJS Kesehatan.

## Jalankan

```bash
npm install
npm run dev        # http://localhost:3000, basis data terisi otomatis
npm test           # tes mesin dan autopilot
npm run seed       # reset data demo (saat server mati); saat server hidup pakai tombol "Atur ulang data demo"
```

Butuh Node 22+. Basis data: `data/sehati.db` (SQLite, dibuat otomatis, tidak ikut di repo).

## Tiga permukaan

| URL | Isi |
|---|---|
| `/` | Halaman produk dan cerita satu episode (Bu Sari) memakai data dari mesin |
| `/m` | Aplikasi peserta (konsep fitur JKN Mobile): peserta memastikan layanan yang ditagihkan |
| `/console` | Konsol petugas: antrean, keputusan otomatis, pra-pengajuan, detail kasus, jejak audit, impor CSV, metrik |

## Autopilot keputusan

- Sakelar **Manual / Otomatis** ada di atas antrean kasus.
- Dalam mode **Otomatis**, kasus diloloskan, dikoreksi, atau ditolak tanpa menunggu petugas.
- Kasus tagihan fiktif yang belum dijawab peserta menunggu jawaban dulu, lalu diputus otomatis begitu peserta menjawab.
- Keputusan berkeyakinan rendah dan sampel acak 1 dari 10 masuk **Keputusan otomatis → Perlu ditinjau**. Di sana petugas bisa menyetujui, mengubah, atau mengembalikan keputusan ke antrean.
- Dalam mode **Manual**, setiap kasus menampilkan *saran autopilot* yang bisa diterapkan dengan satu klik.
- Mesin saat ini **berbasis aturan (simulasi)**. Rencana penggantian dengan AI sungguhan (Claude), pagar pengaman, tahapan uji, dan aspek hukum ada di [`docs/AI-AUTOPILOT.md`](docs/AI-AUTOPILOT.md).

## Cara kerja

- **Mesin berbasis aturan** (`src/lib/engine`): setiap temuan membawa sinyal, bobot, dan batas kesimpulan.
- **Autopilot** (`src/lib/autopilot.ts`): mengubah temuan menjadi keputusan beserta keyakinan, alasan, dan dasar. Bisa ditinjau dan dibatalkan.
- **Data contoh** (`src/lib/seed/generate.ts`): berbenih tetap. Berisi kasus bermasalah, kasus sah yang sengaja dibuat mirip, dan label kebenaran.
- **Jejak audit** (`src/lib/audit.ts`): hash SHA-256 berantai, ditampilkan sebagai kalimat biasa di konsol.
- **Penjelas istilah** (`src/lib/glossary.ts`, `src/components/explain.tsx`): setiap kode dan istilah teknis bisa diklik untuk melihat penjelasan bahasa awam.
- **Metrik** dihitung dari label kebenaran data contoh. Angkanya membuktikan prototipe berfungsi, bukan kinerja di data nyata.

## Batas

Belum terhubung ke SIMRS, layanan resmi BPJS, atau JKN Mobile. Belum ada autentikasi sungguhan: pengalih peran hanya untuk demo. Katalog kode dan tarif adalah simulasi.
