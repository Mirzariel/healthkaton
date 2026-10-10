/* Migrasi modul pending-kartu-bayar-impor. Perubahan skema bersama dibuat sekecil mungkin:
   - tabel baru precheck_runs (riwayat pemeriksaan pra-pengajuan; sebelumnya tidak ada tempat untuk menyimpannya)
   - kolom extractions.created_by (siapa mengetik transkripsi manual; dibutuhkan agar peninjau ≠ penyalin)
   - indeks untuk kueri dasbor. */
export const M004_PKBI = `
CREATE TABLE IF NOT EXISTS precheck_runs (
  id TEXT PRIMARY KEY, claim_id TEXT NOT NULL, facility_id TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('ready','review','hold','insufficient_data')),
  checks_json TEXT NOT NULL, ran_by TEXT NOT NULL, ran_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_precheck_claim ON precheck_runs(claim_id);
ALTER TABLE extractions ADD COLUMN created_by TEXT;
CREATE INDEX IF NOT EXISTS idx_doc_episode ON documents(episode_id);
CREATE INDEX IF NOT EXISTS idx_doc_fac ON documents(facility_id);
CREATE INDEX IF NOT EXISTS idx_ext_doc ON extractions(document_id);
CREATE INDEX IF NOT EXISTS idx_pend_fac ON pending_triage(facility_id);
CREATE INDEX IF NOT EXISTS idx_disp_ref ON disputes(kind, ref_id);
`;
