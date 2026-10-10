# Modul survei dan AI

Pemilik: utas `survei-ai`. Mencakup aplikasi peserta `/m`, mesin wawancara adaptif, penyedia AI, dan dasbor AI `/console/ai` (kecuali `/console/ai/evaluation`, milik `dasbor-evaluasi`). Aturan umum tetap di `KONTRAK-DOMAIN.md`; berkas ini hanya menjelaskan apa yang ditambahkan modul ini.

## 1. Pembagian tugas: aturan, AI, peserta

| Hal | Siapa yang menentukan |
|---|---|
| Pertanyaan apa yang boleh ditanyakan (butir, ruang lingkup, syarat berlaku) | Bank standar yang ditinjau (registry), dievaluasi oleh aturan sebagai data |
| Urutan, anggaran (inti 5, klarifikasi 3 bawaan), kapan sesi selesai | `computeAgenda` (`src/lib/survey/engine.ts`), deterministik |
| Memahami kalimat bebas peserta menjadi usulan fakta | AI (atau penafsir aturan berlabel SIMULASI) |
| Memilih satu pertanyaan berikutnya | AI hanya boleh memilih dari daftar kandidat yang diberikan aturan; di luar daftar ditolak |
| Apakah usulan itu menjadi fakta | **Peserta**, lewat tombol Benar / Ubah / Bukan itu |
| Sinyal, status pembuktian, keputusan | Petugas. AI tidak menulis ke klaim, pembayaran, atau status pembuktian |

## 2. Alur satu giliran

1. `prepareAnswer` (sinkron): otorisasi, cek revisi sesi (409 `stale_revision`), klaim giliran dengan kunci idempotensi, susun permintaan AI (kontrak v1, skema ketat).
2. Panggilan AI (async, hanya di jalur `submitAnswer`) dengan batas waktu dan pengulangan terbatas dari konfigurasi aktif. `submitAnswerSync` dan `runInterviewSimulated` tidak pernah memakai jaringan.
3. `validateInterviewOutput` memeriksa: skema ketat, `request_id` dan revisi sama, slot dan nilai ada di `allowed_slots`, `source_turn_id` benar, kutipan benar-benar ada pada jawaban dan tidak menyerupai perintah, kutipan tidak bertentangan dengan nilai, pilihan pertanyaan berikutnya ada di kandidat, saran redaksi lolos pemeriksaan netralitas.
4. Gagal (waktu habis, tidak tersedia, skema salah, revisi usang) menjadi **fallback**: penafsir aturan yang sama dengan simulator. Sesi tidak berhenti. Tiap panggilan tercatat di `ai_invocations` dengan mode `live`, `simulated`, atau `fallback`.
5. Usulan yang lolos disimpan di `fact_proposals` berstatus `proposed`. Fakta (`participant_facts`) baru terbentuk setelah peserta mengonfirmasi atau mengoreksi. Fakta tidak dihapus; koreksi menggantikan dan menyimpan `supersedes_id` serta asal.
6. Jawaban "lupa/tidak yakin" dan "tidak paham" disimpan sebagai nilai meta dan bobotnya 0 pada sinyal.
7. Saat sesi selesai, jawaban yang menyiratkan kendala menjadi temuan T4 berstatus `signal` (dan baris `service_requests` agar terlihat di "Laporan saya"). Konfirmasi terarah (T1) mengubah skor sinyal: "ya" mengurangi 25, "tidak" menambah 20, "tidak ingat" 0; jawaban pendamping berbobot setengah.

## 3. Penyedia AI

- **Simulasi** (bawaan, tanpa kunci): penafsir aturan deterministik (`src/lib/ai/nlu.ts`). Selalu berlabel "Simulasi (bukan AI)" di aplikasi peserta dan konsol. Hasilnya menunjukkan perilaku validator dan fallback, **bukan kualitas pemahaman bahasa oleh model**.
- **Langsung**: `src/lib/ai/live.ts`, memakai `@anthropic-ai/sdk`, aktif bila `ANTHROPIC_API_KEY` ada di lingkungan server dan konfigurasi tidak memilih "selalu simulasi". Model bawaan `SEHATI_AI_MODEL` atau `claude-sonnet-5-5`; dapat diubah per versi konfigurasi.
- **Status verifikasi yang jujur:** penyedia langsung **belum pernah dipanggil terhadap API sungguhan** pada pengembangan ini (tidak ada kunci di lingkungan pembuatan). Yang sudah diuji: seluruh jalur runtime, validator, fallback, dan pencatatan memakai penyedia palsu pada `tests/survey-ai.test.ts`. Sebelum dipakai di luar demo, jalankan "Uji koneksi" di `/console/ai/config` dan sandbox dengan kunci sungguhan, lalu periksa estimasi biaya dan latensi di `/console/ai`.
- Tabel harga di `live.ts` (per 2026-10-06) hanya dipakai untuk **estimasi** biaya, bukan tagihan.
- Kunci tidak pernah disimpan di basis data, dikirim ke browser, atau ditulis ke log.

## 4. Peta rute

Aplikasi peserta: `/m` (peran peserta dan pendamping).

Konsol `/console/ai` (wewenang `ai.view` kecuali dicatat):

| Rute | Isi |
|---|---|
| `/console/ai` | Operasional model: jumlah panggilan, tingkat fallback, latensi, estimasi biaya, penolakan validator, nasib usulan |
| `/console/ai/sessions`, `/console/ai/sessions/[id]` | Riwayat sesi dan jejak turn: pertanyaan, jawaban, pemrosesan AI, usulan, fakta, temuan, audit |
| `/console/ai/standards` | Butir, versi standar, lokator sumber, status validasi, sesi yang memakai butir draft |
| `/console/ai/summary` | Draf ringkasan bukti kasus (setiap butir menautkan ke sumber) |
| `/console/ai/sandbox` | A/B antar versi prompt, suntik kegagalan, koreksi reviewer (`ai.sandbox`, admin) |
| `/console/ai/config` | Konfigurasi berversi, aktifkan ulang, uji koneksi (ubah: `ai.config`, admin) |

API: `/api/survey/*` (peserta) dan `/api/ai/*` (konsol). Semua memakai `run()` + `getPrincipal`, tanpa pengecekan peran di tampilan saja.

## 5. Lingkungan

| Variabel | Fungsi |
|---|---|
| `ANTHROPIC_API_KEY` | Mengaktifkan penyedia langsung |
| `SEHATI_AI_MODEL` | Model bawaan konfigurasi awal |

Tidak ada migrasi skema baru: modul ini memakai tabel yang sudah ada di migrasi fondasi.

## 6. Daftar validasi terbuka untuk pemilik proses (dr. Yuli) dan peninjau

Semua ini **belum** divalidasi; seluruh butir bank masih berstatus draft dan sesi yang memakainya diberi label di aplikasi.

1. Kalimat setiap pertanyaan peserta (bahasa awam, netral) dan pilihan jawabannya, terutama MED_RECEIPT, MED_REASON, MED_REPLACEMENT, MED_PURCHASE, MED_PAID, MED_EXPLAIN, POST_FU, POST_FEE, POST_OPEN.
2. Bobot sinyal konfirmasi terarah (ya -25, tidak +20, pendamping setengah) dan apakah batas ini sesuai dengan penilaian proses.
3. Anggaran pertanyaan (inti 5, klarifikasi 3) dan masa berlaku sesi (3 hari) serta undangan (7 hari rutin, 10 hari terarah).
4. Penjelasan awam untuk tindakan pada konfirmasi terarah (bronkoskopi, endoskopi, infus, dan lainnya) dan frasa waktu ("sekitar pagi hari").
5. Daftar kata terlarang dan tanda gawat darurat pada teks bebas (`FORBIDDEN_TERMS`, `urgentSignal`): apakah sudah cukup, dan kanal bantuan manusia mana yang berlaku.
6. Kategori laporan peserta dan pemetaannya ke kategori permintaan layanan.
7. Apakah jawaban pendamping sebaiknya hanya dicatat sebagai konteks, atau tetap berbobot setengah.

## 7. Batas yang diketahui

- Penafsir aturan (simulasi/fallback) mengenali pola kalimat yang ditulis di `nlu.ts`; kalimat di luar pola tidak menghasilkan usulan dan peserta diminta memilih jawaban terstruktur. Ini disengaja (lebih baik tidak menebak), tetapi cakupannya terbatas.
- Pembacaan suara memakai `speechSynthesis` peramban; ketersediaan suara bahasa Indonesia bergantung perangkat.
- Penjadwalan kedaluwarsa (`POST /api/survey/expire`) hanya dipanggil manual oleh admin (wewenang `ai.config`) dan oleh seed; belum ada penjadwal latar.
