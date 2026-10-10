# Penyimpanan dan deploy

## Masalah (FAKTA)

Aplikasi memakai SQLite sinkron (`better-sqlite3`) dan semua fungsi domain menerima `db` sinkron. Di Vercel (serverless) hanya `/tmp` yang dapat ditulis, tersimpan per instans, dan hilang pada cold start. Kode memilih `/tmp/sehati-v2.db` bila `VERCEL` terset (`src/lib/db/index.ts`). Akibatnya: data demo kembali ke seed pada cold start dan dapat berbeda antar instans. Cocok untuk demo, tidak untuk data yang harus bertahan.

## Pilihan

| Opsi | Perubahan kode | Persistensi | Risiko |
|---|---|---|---|
| A. Vercel + SQLite `/tmp` (kini) | tidak ada | tidak ada; reset saat cold start | Penonton demo bisa melihat data berbeda antar instans; ubahan hilang |
| B. Host kontainer dengan volume persisten (Fly.io, Railway, VPS) | tidak ada (tetap sinkron) | ya, satu instans | Satu instans; perlu cadangan berkas |
| C. Turso/libSQL atau Postgres di Vercel | besar: API data menjadi async di semua modul | ya, multi-instans | Memengaruhi semua utas paralel; harus diputuskan SEBELUM modul lain ditulis |

## Rekomendasi

Sekarang A untuk demo (nol perubahan, label jelas bahwa data sintetis dan dapat direset). Bila perlu persistensi nyata, B: mempertahankan seluruh kode sinkron. C hanya bila multi-instans memang dibutuhkan; biayanya paling besar dan paling baik diputuskan sebelum utas paralel berjalan.

## Variabel lingkungan

Lihat tabel di `KONTRAK-DOMAIN.md` §9. Ganti `SEHATI_SESSION_SECRET`; isi `SEHATI_ANCHOR_SECRET` agar jangkar audit bertanda tangan; set `SEHATI_DEMO_ROLES=0` di lingkungan non-demo.

## Keputusan

2026-10-10: pemilik proyek memilih **A (demo saja)**: Vercel + SQLite `/tmp`, tanpa perubahan kode. Seluruh modul tetap memakai akses data sinkron (`db` sebagai argumen). Tinjau ulang bila data harus bertahan; pilihan B tidak memerlukan perubahan kode.

## Cold start

`npm run build` menjalankan `scripts/build-seed.ts` (prebuild) yang membuat `seed/sehati-seed.db` berisi data sintetis lengkap (~5,5 MB; seed dari nol memakan ~9 detik). `next.config.ts` menyertakan berkas itu pada trace fungsi, dan `getDb()` menyalinnya ke `/tmp/sehati-v2.db` pada cold start. Bila berkas tidak ada, aplikasi tetap bisa seed dari nol (`SEHATI_NO_PRESEED=1` memaksa jalur itu).
