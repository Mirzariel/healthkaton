# Kontrak domain SEHATI (fondasi)

Dokumen ini adalah acuan bagi modul-modul yang dikerjakan paralel setelah fondasi. Kode di cabang ini adalah sumber kebenaran; dokumen ini merangkum cara memakainya.
Semua data sintetis. Tidak ada integrasi BPJS/faskes nyata.

## 1. Aturan yang ditegakkan di kode (I1–I7)

| # | Aturan | Di mana ditegakkan |
|---|---|---|
| I1 | Penyebab hanya terisi bila bukti `verified` | `CHECK` pada `findings` + `setCauses` + tes |
| I2 | Label netral | `src/lib/labels.ts` (`FORBIDDEN_TERMS`), `src/lib/glossary.ts` |
| I3 | `unknown`, `not_understood`, tidak menjawab bernilai 0 | `cases/signals.ts`, `survey/engine.ts` (`isMetaValue`) |
| I4 | Kepuasan tidak masuk skor indikasi | `signals.ts` tidak membaca jawaban kepuasan; modul survei wajib menjaga |
| I5 | Eskalasi dugaan fraud: hak jawab faskes + reviewer meminta + auditor (orang dan peran berbeda) menyetujui | `cases/core.ts` `requestFraudEscalation`/`approveFraudEscalation` |
| I6 | Setiap perubahan tercatat di audit berantai hash | `audit.ts` `appendAudit`; trigger append-only |
| I7 | Tidak ada pembayaran/koreksi/sanksi otomatis | `recordClaimReview` hanya mencatat (`simulated=1`); tidak ada kode yang mengubah `claims` |

## 2. Tata letak folder dan pemilik modul

```
src/lib/
  clock.ts            jam tunggal (nowIso/nowPrecise/setNow); SEED_NOW = 2026-10-10T09:00
  idem.ts             idempotent(db, scope, key, fn) dan DomainError
  audit.ts            rantai hash, jangkar, verifikasi
  db/{schema,index}   migrasi 001_core, 002_guards, 003_notifications, 004_pkbi (precheck_runs); getDb/openDb/resetDb/nextId
  auth/principal.ts   peran, matriks wewenang (CAPS), assertCan/assertFacility/assertParticipant, cookie sesi demo
  server.ts           getPrincipal(surface), run(), readJson, errorResponse
  domain/transitions  tabel transisi (satu sumber; trigger DB mengikuti, dijaga tes paritas)
  cases/{signals,core} detektor T1–T3 dan seluruh siklus kasus     -> pemilik: fondasi (dipakai kasus-faskes)
  standards/*         registry, applicability, bank soal            -> pemilik: fondasi
  survey/engine.ts    agenda murni (computeAgenda)                  -> fondasi; layanan sesi: survei-ai
  adapters/*          kontrak + implementasi simulasi               -> fondasi
  ai/{contract,invocations}  kontrak AI v1, konfigurasi, log        -> fondasi; runtime: survei-ai
  seed/{base,domain,index}   data sintetis                          -> fondasi; tiap modul menambah berkasnya sendiri
src/components/{ui,Shell,Brand,...}  komponen bersama
src/lib/nav.ts        registri menu; modul membalik ready:true BERSAMAAN dengan halamannya
```

Aturan folder untuk modul baru: `src/lib/<modul>/` (logika, menerima `db` sebagai argumen pertama), `src/app/<permukaan>/...` (halaman), `src/app/api/<modul>/...` (rute), `tests/<modul>.test.ts`. Jangan mengedit berkas modul lain selain menambah baris di `nav.ts` dan `seed/index.ts`.

| Modul / utas | Rute (lihat `nav.ts`) | Berkas inti |
|---|---|---|
| survei-ai | `/m`, `/console/ai`, `/api/survey/*`, `/api/ai/*` | `src/lib/survey/service.ts`, `src/lib/ai/{simulator,live,runtime}.ts` |
| kasus-faskes | `/console/cases`, `/console/assistant`, `/faskes/*` | UI di atas `cases/core.ts` |
| pending-kartu-bayar-impor | `/console/pending`, `/cards`, `/payments`, `/import`, `/precheck`, `/documents` | `src/lib/{pending,cards,payments,import,precheck,evidence}/`; lihat `docs/MODUL-PENDING-KARTU-BAYAR-IMPOR.md` |
| dasbor-evaluasi | `/console/quality`, `/console/ai/evaluation` | `src/lib/{quality,evaluation}/` |

## 3. Tabel kunci (skema `src/lib/db/schema.ts`)

- **Identitas & akses**: `facilities`, `users`, `participants`, `companions`.
- **Episode & klaim**: `episodes` (`context_json`), `services`, `evidence`, `claims`, `claim_items`, `episode_links`, `evidence_searches`.
- **Registry standar**: `source_documents`, `standards`, `standard_versions` (draft→reviewed→approved→retired), `indicator_versions`, `question_versions`, `glossary`, `approval_history`.
- **Survei**: `invitations`, `survey_sessions` (revisi untuk penjaga konflik, `is_sandbox`), `survey_turns`, `fact_proposals`, `participant_facts` (tidak boleh dihapus, hanya `superseded`), `help_requests`, `service_requests`.
- **AI**: `ai_configs`, `ai_invocations` (mode, model, versi prompt, sidik permintaan, latensi, token), `datasets`, `eval_cases`, `eval_runs`, `eval_case_results`, `sandbox_runs`.
- **Bukti & kasus**: `documents`, `extractions`, `evidence_links`, `cases`, `findings`, `review_decisions`, `clarifications`, `clarification_messages`, `assignments`, `disputes`, `improvement_actions`, `follow_ups`.
- **Keuangan & pending**: `pending_triage`, `payment_events`, `policy_versions` (parameter DEMO, berstatus draft), `facility_cards`, `metric_definitions`, `ground_truth` (hanya untuk evaluasi, tidak dibaca mesin deteksi), `import_jobs`.
- **Sistem**: `idempotency_keys`, `audit_log`, `audit_anchors`, `audit_verifications`, `meta`, `notifications`.

## 4. State machine

Tabel di `domain/transitions.ts`; trigger DB (`002_guards`) mengikutinya; `tests/foundation-guards.test.ts` menguji semua pasangan (dari, ke).

- Pembuktian: `signal → under_review | awaiting_clarification | not_verified | inconclusive`; `under_review → awaiting_clarification | verified | not_verified | inconclusive`; `awaiting_clarification → under_review`; status final bisa dibuka lagi ke `under_review` (`reopenFinding`).
- `verified` butuh ≥1 `evidence_links` mendukung + hak jawab terpenuhi (klarifikasi `answered` atau `lapsed`). `inconclusive` butuh catatan `evidence_searches`. Pengusul ≠ penyetuju.
- Tindakan: `open → in_progress → resolved → follow_up_pending | closed`; `follow_up_pending → closed | in_progress`.
- Kasus: `new → assigned | in_progress | closed`; `closed → reopened`.
- Sesi survei: `scheduled → active | expired | cancelled`; `active → completed | partial | expired | cancelled`.
- Klarifikasi: `sent → answered | lapsed | withdrawn`; `lapsed → answered` (lewat tenggat tidak memverifikasi apa pun).

## 5. Adapter (domain hanya bergantung pada antarmuka ini)

`getAdapters(db)` mengembalikan `{ claimFeed, evidence, identity, notification, paymentStatus }`. Setiap adapter punya `status(): { name, source, detail }` dengan `source ∈ simulated | import | live | unavailable`; UI wajib menampilkan sumber lewat `SourceBadge`.

- `ClaimFeedAdapter`: `listClaims(filter)`, `getClaim(id)`.
- `EvidenceAdapter`: `search({ facilityId, episodeId, serviceId })`.
- `IdentityAdapter`: `resolveParticipant(id)`, `isCompanionAuthorized(participantId, companionId)`.
- `NotificationAdapter`: `notify(notice)`, menulis ke `notifications` (kotak keluar, tidak mengirim ke kanal nyata).
- `PaymentStatusAdapter`: `events(claimId)`.

Mengganti sumber = mengganti implementasi di `adapters/index.ts`. Skema domain dan UI tidak berubah.

## 6. AI v1 (`src/lib/ai/contract.ts`)

- Skema `AI_SCHEMA_VERSION = "1.0"`; `interviewRequestZ` dan `interviewOutputZ` strict (field tak dikenal ditolak). Keluaran AI divalidasi sebelum dipakai; gagal → pakai fallback deterministik dan catat mode `fallback`.
- `AIProviderAdapter { kind, provider, interview(), summarizeCase?(), testConnection() }`. Dua implementasi dibuat modul survei-ai: simulator deterministik (selalu berlabel SIMULASI) dan penyedia langsung (aktif hanya bila `ANTHROPIC_API_KEY` ada; `liveAvailable()`). **Penyedia langsung belum ditulis di fondasi.**
- Setiap panggilan dicatat lewat `logInvocation` (mode, model, versi prompt, sidik permintaan, galat). Mode ditampilkan lewat `AiModeBadge`.
- AI hanya memilih dari kandidat yang diberikan `computeAgenda` (bank yang sudah ditinjau); AI tidak membuat butir, tidak menyimpulkan penyebab, tidak memutuskan.

## 7. Wewenang (RBAC)

Peran: `peserta, pendamping, faskes, verifikator, reviewer, auditor, admin`. Matriks `CAPS` di `auth/principal.ts`. Fungsi domain memanggil `assertCan(p, cap)`, `assertFacility(p, facilityId)`, `assertParticipant(db, p, participantId)`; halaman hanya menyembunyikan, server yang menolak. Pemilih peran demo: cookie `sehati_session` ditandatangani HMAC (`SEHATI_SESSION_SECRET`), per permukaan (`getPrincipal("peserta" | "faskes" | "konsol")`); `SEHATI_DEMO_ROLES=0` mematikannya. Ini BUKAN autentikasi produksi.

## 8. Konvensi API

- Rute memakai `run(async () => ...)` dari `server.ts`: respons `{ ok: true, data }` atau `{ ok: false, error, code }` dengan status 400/403/404/409/422.
- Aksi menulis yang bisa diulang klien memakai `idempotent(db, scope, key, fn)` (kunci dari header/badan).
- Sesi survei memakai `revision`: klien mengirim revisi terakhir; ketidakcocokan → 409.
- Setiap aksi menulis memanggil `appendAudit` di dalam transaksi yang sama.
- Teks tampilan dari `labels.ts`/`glossary.ts`; jangan menulis label status di komponen.

## 9. Variabel lingkungan

| Variabel | Fungsi |
|---|---|
| `SEHATI_DB` | Jalur berkas SQLite (bawaan `data/sehati-v2.db`; di Vercel `/tmp/sehati-v2.db`) |
| `SEHATI_SESSION_SECRET` | Kunci tanda tangan cookie demo (ganti di luar demo) |
| `SEHATI_DEMO_ROLES` | `0` mematikan pemilih peran dan atur-ulang data |
| `SEHATI_ANCHOR_SECRET` | Bila ada, jangkar audit diberi MAC |
| `ANTHROPIC_API_KEY` | Mengaktifkan penyedia AI langsung (setelah adapter ditulis) |

## 10. Yang belum ada di fondasi (disengaja)

Layanan sesi survei, simulator dan penyedia AI, antarmuka peserta `/m`, ruang kasus dan portal faskes, pending/kartu/pembayaran/impor/pra-pengajuan, dasbor mutu dan evaluasi, harness evaluasi. Seed untuk 14 skenario baru ditambahkan oleh modul masing-masing; seed fondasi baru memuat Bu Sari dan pola T1–T3.
