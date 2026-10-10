# Dasbor mutu dan evaluasi AI

Modul `dasbor-evaluasi`. Rute: `/console/quality`, `/console/ai/evaluation`. Kode: `src/lib/quality/`, `src/lib/evaluation/`, `src/lib/seed/quality.ts`. Mengikuti `docs/KONTRAK-DOMAIN.md`; tidak ada perubahan skema (tidak ada migrasi baru).

## 1. Dasbor mutu (`/console/quality`)

Wewenang: `quality.view` (verifikator, reviewer, auditor, admin). Faskes dan peserta ditolak di server.

**Apa yang dihitung.** Satu observasi per (sesi rutin, indikator yang berlaku untuk sesi itu). Setiap observasi masuk tepat satu kategori:

| Kategori | Arti | Masuk penyebut gap? |
|---|---|---|
| `negative` | jawaban sah yang berarti butir belum terpenuhi (aturan per indikator di `quality/definitions.ts`, `GAP_RULES`) | ya (pembilang) |
| `positive` | jawaban sah yang berarti terpenuhi | ya |
| `unknown` | tidak tahu / tidak paham / nilai di luar kamus | tidak (aturan I3), tetapi masuk cakupan |
| `not_applicable` | tidak berlaku (aturan penerapan, atau jawaban prasyarat) | tidak |
| `not_asked` | sesi selesai tetapi butir tidak ditanya (anggaran, cabang) | tidak, tetapi terlihat |
| `nonresponse` | sesi kedaluwarsa/dibatalkan | tidak, tetapi terlihat |
| `in_progress` | sesi masih berjalan | tidak |

`gap = negative / (negative + positive)`, dengan interval Wilson 95%. Baris dengan n sah di bawah `MIN_VALID_RESPONSES` (15, **parameter demo, belum divalidasi**) ditandai tidak cukup dan tidak dibandingkan. Tidak pernah ditampilkan 0% atau 100% tanpa n.

**Pemisahan.** Survei rutin dan survei terarah tidak pernah dijumlahkan (tab terpisah). Sesi sandbox tidak dihitung. Skor kepuasan opsional (slot `satisfaction_score`) dibaca terpisah dan tidak pernah masuk gap atau skor indikasi (aturan I4).

**Bagian halaman.** Gap per indikator, per jenis rawat, tren dan perbandingan faskes (saat satu indikator dipilih), ringkasan terarah, enam kotak alur (laporan peserta → sinyal mesin → pembuktian → penyebab → keputusan klaim → tindakan), laporan vs temuan terverifikasi, waktu penyelesaian (median dan P90), keluhan dan permintaan bantuan, sebelum/sesudah intervensi, kepuasan, definisi metrik dan polaritas jawaban per indikator. Ekspor CSV agregat: `GET /api/quality/export`.

**Sebelum/sesudah.** Jendela sebelum 90 hari sebelum `resolved_at`; sesudah mulai `resolved_at`. Pembanding: faskes sepeer (peer group sama) pada indikator yang sama. Verdict `distinct_lower/higher` hanya bila kedua jendela cukup dan interval tidak tumpang-tindih; selain itu `indistinct`, `insufficient`, atau `not_resolved`. Ini pembanding observasional, bukan bukti sebab-akibat.

**Seed sintetis.** `seedQuality` menghasilkan sekitar 800 sesi rutin lewat `computeAgenda` produksi, temuan lewat `createFinding`, dan alur kasus lewat fungsi domain pada antrean peristiwa kronologis (jam diatur dengan `setNow`). Dua pola intervensi sengaja ditanam (lihat komentar di `seed/quality.ts`) agar sebelum/sesudah dapat diperagakan. Jumlah peristiwa yang dilewati dicatat di meta `seed:quality:skipped`. Sesi terarah sengaja **tidak** diisi di sini (milik survei-ai; `loadSignalCtx` membaca fakta `service_performed` terarah sehingga mengisinya akan mengubah sinyal T1).

## 2. Evaluasi AI (`/console/ai/evaluation`)

Wewenang: `ai.eval` (reviewer, auditor, admin). Rute API: `POST /api/evaluation/run`, `GET /api/evaluation/runs`, `GET /api/evaluation/runs/[id]`.

### Aturan klaim
Semua pernyataan tentang AI berasal dari run tersimpan (`evaluationStatus`):

- tanpa run selesai → **"Belum dievaluasi"**; tidak ada angka;
- hanya run aturan/simulator → **"Belum ada evaluasi model AI langsung"**; angka diberi label "BUKAN model AI";
- ada run `rules_plus_llm` dengan mode `live` → "Dievaluasi dengan model langsung", dengan penyedia/model/tanggal dan peringatan dataset sintetis.

Latensi hanya dilaporkan untuk run langsung. Token dan biaya hanya dari data yang dikirim penyedia; selain itu "tidak tersedia". Mode `live` yang diminta tanpa kunci/adapter ditolak 409 (tidak pernah diganti simulasi diam-diam).

### Dataset (`dataset.ts`)
98 kasus: 86 per-giliran dan 12 sesi berskrip; 58 dev dan 40 heldout, dipisah **per skenario** (33 skenario). Seluruh jawaban peserta ditulis tangan, **bukan percakapan nyata**. Dimuat ke `datasets`/`eval_cases` oleh `seedEvaluation`; kandidat pertanyaan dihitung saat run, tidak disimpan.

Cakupan: penerimaan obat (penuh/sebagian/tidak, alasan, pengganti, beli luar, bayar), dokter, lab, biaya, tindak lanjut, tidak tahu/tidak paham/menunda, koreksi, teks perintah dan kepuasan, instruksi vs kejadian (`directed_outside_purchase` vs `outside_purchase`), layanan terarah, puskesmas (lingkup berbeda), pertanyaan konteks (tanpa resep/lab), salah ketik, pendamping. Sebagian kasus bertag `semantik` sengaja di luar jangkauan leksikon aturan sebagai ruang bagi model.

Label `acceptable_next` dan `forbidden_next` **diturunkan** dari fakta emas lewat mesin agenda yang sama (`buildDataset`), bukan ditulis tangan. `validateDataset` memeriksa: kutipan emas adalah potongan jawaban, slot/nilai sah pada konteks, ID pertanyaan ada di bank, tidak ada skenario di dua split.

### Replika langkah giliran (`pipeline.ts`)
Ini replika harness untuk langkah produksi, bukan kode produksi:

1. aturan membaca jawaban terakhir → fakta sementara (`lexicon.ts`, `extractBaseline`);
2. `computeAgenda` menghitung kandidat dari fakta terkonfirmasi + sementara → `candidate_questions`;
3. `baseline_rules`: usulan = hasil aturan; `rules_plus_llm`: `InterviewRequest` disusun (slot dan nilai yang diizinkan dari server) dan dikirim ke `AIProviderAdapter.interview`;
4. `validate.ts`: skema ketat; `request_id`/`session_revision` cocok; id pertanyaan ∈ kandidat (id yang sudah ditanyakan dicatat sebagai `repeated_question`); per butir: slot diizinkan, nilai sah, `source_turn_id` cocok, kutipan adalah potongan jawaban dan tidak bertentangan dengan nilai (`quoteConflicts`); saran kalimat berisi istilah terlarang dibuang;
5. keluaran tidak sah seluruhnya (skema, id, revisi, id pertanyaan) → **fallback ke hasil aturan**; butir bermasalah ditolak satu per satu;
6. pertanyaan berikut **dihitung ulang oleh aturan** atas fakta yang lolos validasi; pilihan model dipakai hanya bila masih sah. Pilihan mentah yang sudah tidak sah dicatat (`pick_current`).

Konsekuensi yang perlu diketahui: karena aturan menentukan kelayakan akhir, kemampuan model tampak terutama lewat pembacaan fakta, bukan lewat kebebasan memilih pertanyaan. Pada bank tetap, "pertanyaan berikut yang tepat" hampir seluruhnya ditentukan oleh fakta yang terbaca.

Sesi: pemutaran dari awal dengan jawaban berskrip per ID pertanyaan (default "saya tidak tahu"), sampai agenda selesai atau 14 giliran.

### Metrik (`metrics.ts`, `score.ts`)
Setiap proporsi membawa k, n, dan interval Wilson 95%.

- presisi, recall, F1 mikro dan makro, dan per slot (TP/FP/FN pada pasangan slot=nilai);
- penanganan tidak tahu (tepat; salah dibaca sebagai ya/tidak);
- dukungan sumber (usulan **mentah**: kutipan potongan jawaban dan sejalan dengan nilai);
- ketepatan giliran; pilihan pertanyaan berikut tepat; memilih pertanyaan terlarang; pilihan mentah masih sah;
- tahan teks perintah (kasus adversarial yang seharusnya tanpa fakta);
- sesi: benar utuh, selesai, akurasi fakta akhir, cakupan rata-rata, giliran rata-rata, pertanyaan terlarang ditanyakan;
- keandalan: keluaran tidak valid, fallback; latensi p50/p95 (hanya live); token/biaya;
- per bagian (dev/heldout); daftar kegagalan per jenis (`FAILURE_LABEL`).

Kegagalan berstatus peringatan (`unsupported_quote`, `fallback`, `repeated_question`) tercatat tetapi tidak membuat kasus "salah" karena keluaran akhir sudah dilindungi validator/aturan.

### Penyedia (`provider.ts`)
`resolveProvider(db, pref)`: `simulated` → simulator referensi (`sehati-reference-simulator`, `kind: 'simulated'`, memakai leksikon yang diperkaya, **bukan model AI**); `live` → hanya bila `ANTHROPIC_API_KEY` ada **dan** adapter terdaftar lewat `registerLiveAdapter(factory)`.

**Integrasi dengan survei-ai:** modul survei-ai memanggil `registerLiveAdapter((db) => adapterAnthropic)` saat inisialisasi (satu baris). Harness hanya bergantung pada `AIProviderAdapter` dan `interviewRequestZ`/`interviewOutputZ` dari `ai/contract.ts`. Bila survei-ai membawa validator produksi, ganti `validate.ts` dengan itu atau samakan perilakunya; selisihnya adalah risiko replika.

### Runner (`runner.ts`)
Menulis hanya ke `eval_runs`, `eval_case_results`, `ai_invocations` (operasi `eval_case`, hanya jalur penyedia AI, dengan `eval_run_id`), `audit_log` (`evaluasi_dijalankan`, `evaluasi_selesai`, hanya ID/enum), `idempotency_keys`, dan penghitung ID. Tes membuktikan tabel layanan tidak berubah. Kunci idempoten: kirim ulang mengembalikan run yang sama; kunci yang sedang berjalan ditolak 409; kunci dilepas bila gagal sebelum ada run. Batas waktu (default 10 menit) menandai run `failed` dengan hasil sebagian tersimpan. Simulator dan aturan berurutan; penyedia langsung memakai kumpulan pekerja kecil (4).

## 3. Keterbatasan yang harus dibaca bersama angkanya

- Dataset sintetis ditulis satu orang; label dan baseline oleh orang yang sama. Heldout dipisah per skenario tetapi **bukan validasi independen**. Label belum ditinjau pengusul maupun dr. Yuli.
- Leksikon dan simulator disetel sambil melihat kasus dev (misalnya pembedaan instruksi vs kejadian diperbaiki setelah satu kasus dev gagal). Selisih dev–heldout adalah petunjuk, bukan ukuran.
- 86 kasus per-giliran dan 12 sesi: interval lebar. Per slot, dukungan kecil.
- Run simulator tidak mengukur kemampuan model. Jalur penyedia langsung belum pernah dijalankan di lingkungan ini (tidak ada kunci); yang diuji hanya adapter tiruan (enum ilegal, field tambahan, kutipan karangan, kepatuhan pada teks perintah, galat, batas waktu).
- Dasbor mutu: parameter ambang demo; sebelum/sesudah observasional; data sintetis.
- Indikator kepuasan belum ada di bank: dasbor membaca fakta `satisfaction_score` (tanpa indikator). Survei-ai/fondasi perlu menambah butir opsional agar data nyata terkumpul.
- Temuan pada fondasi: `MED_EXPLAIN` terblokir selama `MED_FULFILLMENT` tidak berlaku (konteks resep pulang tidak diketahui/tidak), sehingga banyak sesi `partial` dengan butir `not_asked`.
- Entri audit seed kualitas memakai cap waktu historis sehingga tidak monoton terhadap entri fondasi; rantai hash tetap sah.

## 4. Perubahan pada berkas bersama
- `src/lib/seed/index.ts`: memanggil `seedQuality` dan `seedEvaluation` setelah `seedDomain`.
- `src/lib/nav.ts`: `ready: true` untuk `/console/quality` dan `/console/ai/evaluation`.
- Tidak ada perubahan skema/migrasi.

## 5. Menjalankan
- UI: masuk sebagai reviewer, auditor, atau admin → "Evaluasi AI" → pilih bagian dataset dan sistem → "Jalankan evaluasi".
- API: `POST /api/evaluation/run` dengan `{ "split": "dev", "systems": ["baseline_rules","rules_plus_llm"], "provider": "simulated", "idempotency_key": "..." }`.
- Tes: `npx vitest run tests/quality.test.ts tests/evaluation.test.ts`.
