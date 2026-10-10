/* Migrasi modul kasus-faskes. Berdiri sendiri agar tidak berbenturan dengan modul lain; didaftarkan di db/schema.ts (satu baris).
   Isi:
   - evidence_searches.finding_id: pencarian bukti untuk temuan tanpa klaim (mis. laporan layanan) tetap dapat dicatat.
   - case_summaries: DRAF ringkasan bukti (mode simulasi/langsung/fallback), dapat dikoreksi petugas. Bukan keputusan.
   - assistant_suggestions: saran langkah pemeriksaan. Petugas menerima/mengubah/menolak dengan alasan; saran tidak dieksekusi otomatis.
   - case_notes: catatan internal petugas. Tidak pernah ditampilkan ke faskes atau peserta. */
export const M005_CASEWORK = `
ALTER TABLE evidence_searches ADD COLUMN finding_id TEXT;

CREATE TABLE IF NOT EXISTS case_summaries (
  id TEXT PRIMARY KEY, case_id TEXT NOT NULL, finding_id TEXT NOT NULL, version INTEGER NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('live','simulated','fallback')), provider TEXT, model TEXT,
  prompt_version TEXT NOT NULL, schema_version TEXT NOT NULL, invocation_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','reviewed')),
  content_json TEXT NOT NULL, evidence_fingerprint TEXT NOT NULL,
  corrections_json TEXT NOT NULL DEFAULT '[]',
  created_by TEXT NOT NULL, created_at TEXT NOT NULL,
  UNIQUE (finding_id, version)
);
CREATE INDEX IF NOT EXISTS idx_sum_case ON case_summaries(case_id);

CREATE TABLE IF NOT EXISTS assistant_suggestions (
  id TEXT PRIMARY KEY, summary_id TEXT NOT NULL, case_id TEXT NOT NULL, finding_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('clarification_request','evidence_search','participant_confirmation','record_gap')),
  text TEXT NOT NULL, payload_json TEXT NOT NULL DEFAULT '{}', refs_json TEXT NOT NULL DEFAULT '[]',
  state TEXT NOT NULL DEFAULT 'proposed' CHECK (state IN ('proposed','accepted','modified','dismissed','superseded')),
  final_text TEXT, decision_reason TEXT, decided_by TEXT, decided_role TEXT, decided_at TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sug_case ON assistant_suggestions(case_id);
CREATE INDEX IF NOT EXISTS idx_sug_state ON assistant_suggestions(state);

CREATE TABLE IF NOT EXISTS case_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT, case_id TEXT NOT NULL, finding_id TEXT,
  author_id TEXT NOT NULL, author_role TEXT NOT NULL, text TEXT NOT NULL, at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_note_case ON case_notes(case_id);
`;
