# Modul pending, kartu, pembayaran, impor, pra-pengajuan, dokumen bukti

Modul `pending-kartu-bayar-impor` (spec bagian 6.7 dan 6.8). Semua data sintetis. Tidak ada koneksi produksi ke BPJS atau faskes. Diurutkan menurut hal yang paling perlu diketahui pembaca.

## 1. Batas yang disengaja

| Hal | Perilaku |
|---|---|
| Pending tinggi, kartu kuning/merah | Alat visibilitas dan pembinaan. Bukan dugaan fraud, vonis, peringkat publik, atau sanksi. Teks ini muncul di setiap halaman terkait. |
| Kategori pending | Cara penanganan awal (kelengkapan dokumen, koding, ketidaksesuaian data, perlu pendalaman). Bukan penyebab final. |
| "Tahan" pada pra-pengajuan | Rekomendasi peninjauan di demo. Bukan blokir pengajuan ke BPJS. |
| Keterlambatan pembayar | Hanya dinilai bila ada tanggal berkas dinyatakan lengkap dan tenggat. Tidak pernah disimpulkan dari tanggal pengajuan. Pending di antaranya dicatat terpisah. |
| Parameter ambang kartu dan tenggat bayar | **DRAFT/DEMO**, dilabeli di UI, CSV ekspor, dan basis kartu. Aplikasi ini tidak punya tombol "tervalidasi". Mengubah ambang membuat versi baru berstatus draft; versi lama tidak diubah. |
| Data kurang | `insufficient_data` / "Data belum cukup". Tidak pernah hijau. Faskes tanpa sejawat cukup (kelas C, puskesmas) memang berakhir di sini. |
| OCR | Tidak ada hasil OCR palsu. PDF berlapis teks dibaca sungguhan (`unpdf`). Pindaian/gambar: OCR hanya bila `tesseract` (dan `pdftoppm` untuk PDF) terpasang; selain itu status "OCR belum tersedia" dan jalur transkripsi manual. |
| AI | Modul ini tidak memanggil AI. Tidak ada kode di sini yang mengubah tabel `claims` (aturan I7); tes menjaganya. |

## 2. Yang belum teruji (jujur)

- Mesin OCR sungguhan **belum diuji** di lingkungan pengembangan ini (tidak terpasang). Adapter diuji dengan mesin tiruan yang disuntikkan; perilaku `tesseract` nyata belum terbukti. `SEHATI_OCR=off` mematikannya, `SEHATI_OCR_LANG` memilih bahasa (bawaan `eng`; bahasa Indonesia butuh paket bahasa terpasang).
- Ambang kartu (`min_claims` 20, rasio kuning 1,5, rasio merah 2,5, dst.) dan tenggat bayar 15 hari adalah angka demo tanpa dasar ketentuan resmi.
- Data seed per faskes tipis; kartu memakai periode kuartal agar penyebutnya masuk akal. Kuartal berjalan ditandai "belum lengkap".
- Kode alasan pending (`BERKAS_KURANG`, dst.) adalah kode simulasi, bukan kode resmi pembayar.

## 3. Rute dan hak akses

| Rute | Wewenang | Isi |
|---|---|---|
| `/console/pending`, `/[id]` | `case.view` (lihat), `pending.manage` (aksi) | Pemilahan, umur, per faskes dengan penyebut, observasi mesin independen, jawaban faskes, bantahan |
| `/console/cards`, `/[facilityId]` | `cards.view`, `cards.configure` (parameter) | Matriks faskes × periode; dasar: pembilang/penyebut, median sejawat (n), rasio, alasan, contoh klaim, bantahan |
| `/console/payments`, `/[claimId]` | `payments.view` | Cermin dua arah per faskes, daftar klaim, garis waktu, ekspor CSV |
| `/console/import` | `import.run` (admin) | Pratinjau → terapkan; templat; riwayat |
| `/console/precheck`, `/[claimId]` | `precheck.use` | Pemeriksaan klaim draft/dikembalikan; riwayat |
| `/console/documents`, `/[id]` | `evidence.upload` atau `evidence.review` | Unggah, status ekstraksi, transkripsi manual, tinjauan usulan |

## 4. Kontrak API (untuk portal faskes oleh utas kasus-faskes)

Semua rute mengembalikan `{ ok, data | error, issues? }`. Rute yang dipakai bersama menerima `?as=faskes` agar memakai persona faskes (cookie sesi demo faskes); tanpa itu memakai persona konsol. Server selalu menegakkan hak akses; UI hanya menyembunyikan.

| Rute | Metode | Badan | Peran |
|---|---|---|---|
| `/api/pending/[id]?as=faskes` | POST | `{action:"respond", text, documentId?}` atau `{action:"dispute", text}` | faskes (miliknya saja) |
| `/api/pending/[id]` | POST | `{action:"reclassify", category, reason}` / `{action:"resolve", note}` / `{action:"escalate", reason}` | verifikator, reviewer, admin |
| `/api/pending/sync` | POST | - | petugas |
| `/api/disputes/[id]` | POST | `{outcome: accepted\|rejected\|noted, response, newCategory?}` | reviewer, admin (`dispute.resolve`) |
| `/api/cards/dispute` | POST | `{cardId, text}` | faskes (kartu miliknya) |
| `/api/cards/policy` | POST | `{params, note}` | `cards.configure` |
| `/api/cards/recompute` | POST | - | `cards.configure` |
| `/api/payments/export` | GET | `?facility=&class=&period=YYYY-MM` | `payments.view` |
| `/api/import` | POST | JSON `{kind, fileName?, text}` atau multipart `kind`+`file` | `import.run` |
| `/api/import/[id]/apply` | POST | `{allowPartial?}` | `import.run` |
| `/api/import/template/[kind]` | GET | - | siapa pun yang masuk |
| `/api/precheck?as=faskes` | POST | `{claimId, save?}` | faskes (klaimnya), petugas |
| `/api/evidence/documents?as=faskes` | POST | multipart `file`, `episodeId?`, `facilityId?`, `caseId?`, `findingId?`, `clarificationId?` | faskes, petugas |
| `/api/evidence/documents/[id]` | GET | `?inline=1` (khusus gambar) | pemilik faskes, petugas; tercatat di audit |
| `/api/evidence/documents/[id]/transcribe` | POST | `{pages:[{page,text}]}` | `evidence.review` |
| `/api/evidence/documents/[id]/process` | POST | - | pemilik/petugas; juga memproses ulang "OCR belum tersedia"/"gagal" |
| `/api/evidence/extractions/[id]` | PATCH | `{action: confirm\|correct\|reject, correctedText?}` | `evidence.review` |

Komponen klien yang dapat dipakai ulang di portal faskes: `src/components/pkbi/PendingForms.tsx` (`PendingFaskesPanel`), `CardForms.tsx` (`CardDisputeForm`), `EvidenceForms.tsx` (`UploadForm surface="faskes"`), `PrecheckForms.tsx` (`SaveRunButton surface="faskes"`). Catatan: faskes tidak punya `evidence.review`, jadi transkripsi manual dan tinjauan dilakukan petugas internal.

Fungsi domain untuk modul lain: `provenanceOf(db, extractionId)` (rujukan bukti: dokumen, halaman, mesin, status, teks efektif), `mirrorFor(db, facilityId)` (ringkasan pembayaran per faskes untuk dasbor mutu), `listCards`, `pendingStats`.

## 5. Aturan kartu

Periode kuartal (`2026-K1`) atau bulan, diatur di parameter. Empat metrik, masing-masing dengan pembilang/penyebut tertulis:

| Metrik | Pembilang / penyebut | Minimum |
|---|---|---|
| Tingkat klaim pending | pending atau dikembalikan / klaim diajukan di periode | `min_claims` |
| Temuan terbukti per 100 klaim | temuan `verified` / klaim diajukan | `min_claims` |
| Gap laporan peserta | jawaban negatif pada butir keberadaan layanan / jawaban ya-tidak valid (tidak ingat, tidak paham dikeluarkan) | `min_responses` |
| Klarifikasi lewat tenggat | lewat tenggat tanpa jawaban / klarifikasi dikirim | `min_clarifications` |

Pembanding = maksimum antara median faskes sejawat (kelompok sama, jenis sama, periode sama, datanya cukup; butuh ≥ `min_peers`) dan lantai metrik. Metrik "meningkat" bila nilainya ≥ lantai **dan** ≥ `yellow_ratio`× pembanding; "tinggi" bila ≥ `red_ratio`× pembanding. Kuning = ada metrik meningkat; merah = ≥ `min_metrics_for_red` metrik tinggi. Level `insufficient_data` bila metrik utama (tingkat pending) tidak punya penyebut cukup atau sejawat kurang, dan selalu untuk FKTP (kapitasi, tidak ada klaim per kejadian). Metrik lain yang datanya kurang tidak dihitung dan disebut di alasan. Syarat `consecutive` periode berturut-turut tersedia. Jawaban negatif pada gap laporan = `no`, `none`, `partial`. Kartu dihitung dengan UPSERT sehingga id kartu (acuan bantahan) stabil; perubahan level dicatat di audit. Bantahan diterima = kartu ditandai untuk ditinjau ulang, level tidak diubah tangan.

## 6. Format impor

Selalu pratinjau dulu (tidak menulis data domain), baru terapkan. Maks. 1 MB dan 5000 baris. CSV (koma atau titik koma, kutip ganda, BOM) atau JSON untuk standar. Urutan disarankan: `episode_klaim` → `layanan` → `status_bayar`. Templat dan kolom lengkap ada di `/console/import` dan `src/lib/import/formats.ts`.

- Duplikat: dedup menurut kunci (mis. `claim_no`). Isi identik dilewati; isi berbeda ditolak sebagai konflik, data lama tidak diubah.
- Penerapan idempoten per pekerjaan; baris bergalat menahan penerapan kecuali ada konfirmasi parsial eksplisit (hanya baris valid masuk).
- Data impor berlabel sumber `import` ("Impor tervalidasi") dan menang atas simulasi pada tampilan pembayaran.
- Setelah `episode_klaim`/`layanan`/`status_bayar` diterapkan: sinyal disinkronkan, pemilahan pending disinkronkan, kartu dihitung ulang (hasil tampil di ringkasan pekerjaan). `status_bayar` memperbarui `claims.status` mengikuti peristiwa sumber; ini mencerminkan data sumber, bukan keputusan SEHATI.
- Peserta memakai pseudonim; tidak ada nama atau NIK.

## 7. Dokumen bukti

Yang diterima: PDF, PNG, JPEG, maks. 4 MB, maks. 50 halaman. Validasi memeriksa isi berkas (magic bytes), ekstensi, dan tipe yang dikirim; nama dibersihkan dari jalur; PDF dengan `/JavaScript`, `/OpenAction`, `/Launch`, `/EmbeddedFile`, dsb. ditolak. Unduhan: `nosniff`, `Content-Security-Policy: sandbox`, `attachment` (inline hanya gambar), terotorisasi, tercatat di audit. Unggahan identik (hash, faskes, episode sama) tidak menggandakan dokumen.

Alur status: `uploaded` → `text_extracted` (usulan menunggu tinjauan) / `ocr_unavailable` / `needs_manual_transcription` / `failed` → `reviewed`. Setiap teks adalah **usulan** sampai peninjau mengonfirmasi, mengoreksi (teks asli tetap tersimpan), atau menolak. Transkripsi manual tidak boleh dikonfirmasi pengetiknya sendiri (empat mata). Ekstraksi berlabel mesin: `pdf_text`, `ocr`, `manual`, atau `demo_fixture` (SIMULASI).

## 8. Seed demo

`src/lib/seed/keuangan.ts` (dipanggil dari `seedAll`) menambah, setelah seed fondasi: peristiwa bayar RSCM dihapus (sumber tidak tersedia); sebagian klaim RSTS/RSNM/RSHB/RSBS dibayar melewati tenggat demo; 10 klaim RSNM kuartal 2 menjadi pending `BERKAS_KURANG` (kartu kuning karena kelengkapan berkas); alur pending (dokumen diunggah, dijawab faskes, diselesaikan, dikategorikan ulang, bantahan, dipindah ke kasus sebagai sinyal T5); kartu dan dua bantahan kartu; empat riwayat pra-pengajuan; tiga dokumen contoh (PDF teks, PDF pindaian tanpa OCR, PNG dengan fixture SIMULASI).

Teks ekstraksi PDF pada seed adalah teks yang dibangkitkan generator dokumen contoh, ditangkap langsung karena seed berjalan sinkron sedangkan pembaca PDF async. Tes `pkbi-import-precheck-evidence` memastikan teks itu sama persis dengan hasil pembacaan langsung `unpdf`.

## 9. Perubahan pada berkas bersama

- `src/lib/db/schema.ts`: satu migrasi baru `004_pkbi` (`src/lib/db/migrations-pkbi.ts`): tabel `precheck_runs`, kolom `extractions.created_by`, beberapa indeks. Tidak mengubah migrasi lama.
- `src/lib/nav.ts`: lima baris dibalik `ready: true`, satu baris baru "Dokumen bukti".
- `src/lib/seed/index.ts`: memanggil `seedKeuangan`.
- `tests/state-machine.test.ts`: pernyataan "tidak ada temuan di luar yang disuntikkan" kini hanya menghitung temuan hasil detektor (`source <> 'pending'`), karena temuan T5 dari pemindahan pending dibuat manusia pada klaim di luar ground truth.
