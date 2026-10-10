# Modul kasus-faskes

Cakupan: spesifikasi 6.3 (konsol dan ruang kasus), 6.4 (portal faskes), 9 (alur bukti dan perbaikan), serta bagian ringkasan kasus pada 6.6 dan 8.5 di dalam ruang kasus. Prinsip: AI membantu menyusun dan menyarankan; keputusan temuan, klaim, pembayaran, sanksi, resep, dan diagnosis tidak pernah diambil AI.

## Rute

| Rute | Peran | Isi |
|---|---|---|
| `/console/cases` | verifikator, reviewer, auditor, admin | Antrean pembuktian dan antrean tindakan perbaikan (tab terpisah), filter dan paginasi |
| `/console/cases/[id]` | sama | Ruang kasus: klaim dan layanan, pernyataan peserta, dokumen faskes, bukti tertaut, pencarian bukti, ringkasan asisten, klarifikasi, usulan dan persetujuan, penyebab dan eskalasi, peninjauan klaim (simulasi), bantahan, tindakan, linimasa, catatan internal |
| `/console/assistant` | verifikator, reviewer, admin | Kotak saran asisten lintas kasus; petugas menerima, mengubah, atau tidak memakai saran dengan alasan |
| `/console/autopilot` | - | Redirect ke `/console/assistant` |
| `/api/autopilot/*`, `/api/cases/[id]/auto` | - | `410 Gone` untuk semua metode. Keputusan otomatis dinonaktifkan |
| `/faskes` | faskes | Beranda: menunggu dijawab, lewat tenggat, bantahan terbuka, tindakan berjalan |
| `/faskes/klarifikasi`, `/faskes/klarifikasi/[id]` | faskes | Daftar dan detail permintaan; jawaban teks dan dokumen terlampir |
| `/faskes/temuan/[id]` | faskes | Satu temuan menurut sudut pandang faskes, bantahan, tindakan |
| `/faskes/bukti` | faskes | Dokumen yang diunggah |
| `/faskes/tindakan` | faskes | Rencana tindakan perbaikan |
| `/faskes/bantahan` | faskes | Bantahan atas temuan |
| `/faskes/mutu` | faskes | Laporan mutu faskes sendiri |

Tulis lewat `POST /api/casework/commands` (staf), `POST /api/faskes/commands` (faskes), `POST /api/casework/upload` dan `POST /api/faskes/upload` (dokumen), `GET /api/documents/[id]` (unduh dengan pemeriksaan akses). Semua menerima header `Idempotency-Key`.

## Perintah (`src/lib/casework/commands.ts`)

Daftar perintah dipisah menurut peran dan divalidasi zod sebelum diproses.

- Staf: `assign_case`, `start_review`, `send_clarification`, `withdraw_clarification`, `add_note`, `link_evidence`, `record_search`, `propose_proof`, `decide_proof`, `set_causes`, `request_escalation`, `decide_escalation`, `reopen_finding`, `claim_review`, `request_followup`, `complete_followup`, `close_case`, `resolve_dispute`, `transcribe_document`, `review_extraction`, `generate_summary`, `correct_summary`, `decide_suggestion`, `create_action`, `start_action`, `resolve_action`.
- Faskes: `respond_clarification`, `create_dispute`, `create_action`, `start_action`, `resolve_action`.

Setiap perintah berjalan dalam satu transaksi dengan `appendAudit`; `generate_summary` adalah satu-satunya yang asinkron (dapat memanggil model).

## Matriks akses

| Aksi | verifikator | reviewer | auditor | admin | faskes | peserta |
|---|---|---|---|---|---|---|
| Lihat antrean dan ruang kasus | ya | ya | ya | ya | tidak | tidak |
| Kerja kasus (klarifikasi, bukti, usulan, ringkasan) | ya | ya | tidak | tidak | tidak | tidak |
| Menyetujui usulan, mengisi penyebab | tidak | ya | tidak | tidak | tidak | tidak |
| Eskalasi dugaan | tidak | mengajukan | menyetujui | tidak | tidak | tidak |
| Menanggapi bantahan | tidak | ya | ya | tidak | tidak | tidak |
| Menjawab klarifikasi, unggah, tindakan, bantahan | tidak | tidak | tidak | tidak | faskes sendiri | tidak |

Faskes lain selalu ditolak di server (`assertFacility` dan pemeriksaan kepemilikan pada setiap kueri portal), bukan hanya disembunyikan di UI.

## Apa yang tidak dilihat faskes

Skor dan sinyal, label dugaan (`suspected_fraud`), catatan internal, ringkasan dan saran asisten, identitas serta jawaban individual peserta. Temuan baru baru terlihat setelah ada klarifikasi yang tidak ditarik atau tindakan perbaikan (`FACILITY_VISIBLE_SQL`). Judul temuan dari sumber survei diganti label jenis dan judul butir standar. Agregat survei di `/faskes/mutu` disembunyikan bila responden kurang dari 5 (`MIN_N_FACILITY`).

## Ringkasan dan saran asisten

- Mode `live` hanya bila `ANTHROPIC_API_KEY` ada dan konfigurasi mengizinkan; selain itu `simulated` (penyusun aturan, berlabel "Simulasi"). Kegagalan, waktu habis, atau keluaran yang ditolak validator menghasilkan `fallback` yang tercatat di `ai_invocations`.
- Paket bukti yang dikirim ke model diminimalkan (tanpa identitas peserta dan nama faskes). Keluaran wajib lolos skema ketat, rujukan harus menunjuk ke id yang ada, dan tidak boleh memuat istilah tidak netral atau bahasa putusan.
- Jawaban "lupa" dan "tidak paham" bernilai nol. Dokumen yang belum ditemukan tidak dianggap bukti layanan tidak dilakukan.
- Saran tidak pernah dieksekusi otomatis. Mengubah atau menolak saran mewajibkan alasan. Empat opsi peninjauan klaim tercatat `simulated=1` dan tidak mengubah status temuan.
- Dokumen: jenis ditentukan dari isi berkas, maksimal 3 MB. PDF bertulisan dibaca teksnya; pindaian dan gambar masuk jalur transkripsi manual (tanpa OCR). Hasil ekstraksi tetap usulan sampai ditelaah petugas.

## Perubahan pada berkas bersama (diungkapkan)

| Berkas | Perubahan |
|---|---|
| `src/lib/db/schema.ts` | Satu baris migrasi `005_casework` (`M005_CASEWORK` dari `src/lib/casework/schema.ts`). Nomor 005 dipilih agar tidak bentrok dengan `004_pkbi` milik modul pending-kartu-bayar-impor |
| `src/lib/cases/core.ts` | `proposeProof`: pemeriksaan "tidak dapat dibuktikan" menghitung pencarian per temuan atau per klaim. `decideProof`: menolak persetujuan "terbukti" selama ada bantahan terbuka |
| `src/lib/ai/invocations.ts` | `parseJson` menjadi fungsi pembungkus untuk memutus siklus impor (`db/index` mengimpor seed) |
| `src/lib/seed/index.ts`, `src/lib/seed/kasus.ts` | Seed skenario kasus S3, S6, S7, S8, S14 setelah seed domain; temuan hero F-0001 sampai F-0004 tidak berubah |
| `src/lib/nav.ts` | `ready: true` untuk `/console/cases`, `/console/assistant`, dan permukaan `/faskes` |
| `tests/state-machine.test.ts` | Satu pengujian diubah: asumsi bahwa `improvement_actions` kosong tidak lagi benar karena seed memuat dua tindakan. Kini menyasar id yang tidak ada dan menegaskan bahwa `in_progress` ke `closed` ditolak trigger |

## Batasan yang diketahui

- Jejak audit seed: entri `seedStandards` bertanggal 10-10 mendahului entri kasus yang dibuat mundur; rantai hash tetap sah (`verifyChain` tidak mensyaratkan urutan waktu).
- Tidak ada OCR; transkripsi pindaian manual.
- Penyimpanan tetap SQLite sinkron dan bersifat demo.
