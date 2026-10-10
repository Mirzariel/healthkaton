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
