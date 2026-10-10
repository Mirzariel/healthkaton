/* Skema SQLite v2 SEHATI. Migrasi berurutan, aman diulang (IF NOT EXISTS + tabel schema_migrations).
   Aturan wajib yang ditegakkan di basis data (bukan hanya di tampilan):
   - I1: penyebab temuan hanya boleh terisi bila proof_status = 'verified' (CHECK pada findings).
   - audit_log append-only (trigger menolak UPDATE/DELETE).
   - nilai enum status dibatasi CHECK agar transisi liar ditolak. */

import { M004_PKBI } from "./migrations-pkbi";

export const ROLES_SQL = "'peserta','pendamping','faskes','verifikator','reviewer','auditor','admin'";

const M001 = `
-- ---------- Identitas & akses ----------
CREATE TABLE IF NOT EXISTS facilities (
  id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('fkrtl','fktp')),
  class TEXT, unit_cost_band TEXT, peer_group TEXT, region TEXT, is_demo INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN (${ROLES_SQL})),
  facility_id TEXT REFERENCES facilities(id), participant_id TEXT
);
CREATE TABLE IF NOT EXISTS participants (
  id TEXT PRIMARY KEY, pseudonym TEXT UNIQUE NOT NULL, name TEXT, nik TEXT, dob TEXT,
  coverage_start TEXT, coverage_end TEXT, faskes1 TEXT
);
CREATE TABLE IF NOT EXISTS companions (
  id TEXT PRIMARY KEY, participant_id TEXT NOT NULL REFERENCES participants(id),
  name TEXT NOT NULL, relation TEXT, authorized INTEGER NOT NULL DEFAULT 0, note TEXT
);

-- ---------- Episode, layanan, klaim ----------
CREATE TABLE IF NOT EXISTS episodes (
  id TEXT PRIMARY KEY, participant_id TEXT NOT NULL REFERENCES participants(id),
  facility_id TEXT NOT NULL REFERENCES facilities(id), hospital TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('RJTL','RITL')),
  care_type TEXT NOT NULL CHECK (care_type IN ('outpatient','inpatient')),
  phase TEXT NOT NULL DEFAULT 'closed' CHECK (phase IN ('pre','intra','post','closed')),
  admit_at TEXT NOT NULL, discharge_at TEXT NOT NULL, dx_code TEXT, dx_text TEXT, group_code TEXT,
  context_json TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY, episode_id TEXT NOT NULL REFERENCES episodes(id), code TEXT, name TEXT,
  performed_at TEXT, performer TEXT, qty INTEGER, amount INTEGER
);
CREATE TABLE IF NOT EXISTS evidence (
  id TEXT PRIMARY KEY, episode_id TEXT NOT NULL REFERENCES episodes(id), service_id TEXT,
  type TEXT, recorded_at TEXT, performer TEXT, summary TEXT
);
CREATE TABLE IF NOT EXISTS claims (
  id TEXT PRIMARY KEY, claim_no TEXT UNIQUE, episode_id TEXT NOT NULL REFERENCES episodes(id),
  facility_id TEXT NOT NULL REFERENCES facilities(id), group_code TEXT, amount INTEGER,
  status TEXT NOT NULL CHECK (status IN ('draft','submitted','paid','pending','returned')),
  submitted_at TEXT, paid_at TEXT, hospital TEXT
);
CREATE TABLE IF NOT EXISTS claim_items (
  id TEXT PRIMARY KEY, claim_id TEXT NOT NULL REFERENCES claims(id), service_id TEXT NOT NULL REFERENCES services(id),
  amount INTEGER, UNIQUE (claim_id, service_id)
);
CREATE TABLE IF NOT EXISTS episode_links (
  id TEXT PRIMARY KEY, claim_id TEXT NOT NULL, related_claim_id TEXT NOT NULL,
  relation TEXT NOT NULL CHECK (relation IN ('same_episode_repeat','similar_repeat','continuation','overlap','related')),
  confidence REAL NOT NULL, status TEXT NOT NULL CHECK (status IN ('auto','suggested','confirmed','rejected')),
  reason_json TEXT NOT NULL DEFAULT '{}', linkage_version TEXT NOT NULL, decided_by TEXT, decided_at TEXT, note TEXT,
  UNIQUE (claim_id, related_claim_id, relation)
);
CREATE TABLE IF NOT EXISTS evidence_searches (
  id INTEGER PRIMARY KEY AUTOINCREMENT, claim_id TEXT, service_id TEXT, source TEXT NOT NULL, query TEXT,
  result TEXT NOT NULL CHECK (result IN ('found','not_found','inconsistent')), found_ref TEXT, at TEXT NOT NULL, actor TEXT NOT NULL
);

-- ---------- Registry standar ----------
CREATE TABLE IF NOT EXISTS source_documents (
  id TEXT PRIMARY KEY, kind TEXT, title TEXT NOT NULL, publisher TEXT, url TEXT, file_name TEXT, doc_date TEXT,
  accessed_at TEXT, version TEXT, locator_note TEXT, scope TEXT, relevance TEXT,
  validation_status TEXT NOT NULL DEFAULT 'awaiting_validation' CHECK (validation_status IN ('awaiting_validation','validated','conflict','not_provided')),
  validation_owner TEXT, notes TEXT
);
CREATE TABLE IF NOT EXISTS standards (id TEXT PRIMARY KEY, name TEXT NOT NULL, owner TEXT);
CREATE TABLE IF NOT EXISTS standard_versions (
  id TEXT PRIMARY KEY, standard_id TEXT NOT NULL REFERENCES standards(id), version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','reviewed','approved','retired')),
  scope_json TEXT NOT NULL DEFAULT '[]', source_ids_json TEXT NOT NULL DEFAULT '[]', notes TEXT,
  created_by TEXT, created_at TEXT, reviewed_by TEXT, reviewed_at TEXT, approved_by TEXT, approved_at TEXT, retired_at TEXT,
  UNIQUE (standard_id, version)
);
CREATE TABLE IF NOT EXISTS indicator_versions (
  id TEXT PRIMARY KEY, indicator_id TEXT NOT NULL, version TEXT NOT NULL,
  standard_version_id TEXT NOT NULL REFERENCES standard_versions(id),
  title TEXT NOT NULL, description TEXT,
  kind TEXT NOT NULL DEFAULT 'existence' CHECK (kind IN ('existence','communication','quality','cost','administrative')),
  stage TEXT NOT NULL CHECK (stage IN ('pre','intra','post','directed')),
  scope_json TEXT NOT NULL DEFAULT '[]', applicability_json TEXT, required_slots_json TEXT NOT NULL DEFAULT '[]',
  conditional_rules_json TEXT NOT NULL DEFAULT '[]', slots_json TEXT NOT NULL DEFAULT '[]', signal_rules_json TEXT NOT NULL DEFAULT '[]',
  observable_by_patient INTEGER NOT NULL DEFAULT 1, source_id TEXT REFERENCES source_documents(id), locator TEXT,
  UNIQUE (indicator_id, version)
);
CREATE TABLE IF NOT EXISTS question_versions (
  id TEXT PRIMARY KEY, indicator_version_id TEXT NOT NULL REFERENCES indicator_versions(id), version INTEGER NOT NULL DEFAULT 1,
  target_slot TEXT NOT NULL, text TEXT NOT NULL,
  answer_type TEXT NOT NULL DEFAULT 'choice' CHECK (answer_type IN ('choice','free')),
  options_json TEXT NOT NULL DEFAULT '[]', helper TEXT, is_core INTEGER NOT NULL DEFAULT 1, ord INTEGER NOT NULL DEFAULT 0,
  clinical_reviewed_by TEXT, clinical_reviewed_at TEXT
);
CREATE TABLE IF NOT EXISTS glossary (term TEXT PRIMARY KEY, plain TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS approval_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT, object_type TEXT NOT NULL, object_id TEXT NOT NULL,
  from_status TEXT, to_status TEXT NOT NULL, actor TEXT NOT NULL, role TEXT NOT NULL, note TEXT, at TEXT NOT NULL
);

-- ---------- Survei ----------
CREATE TABLE IF NOT EXISTS invitations (
  id TEXT PRIMARY KEY, episode_id TEXT NOT NULL REFERENCES episodes(id), participant_id TEXT NOT NULL REFERENCES participants(id),
  stage TEXT NOT NULL CHECK (stage IN ('pre','intra','post','directed')),
  mode TEXT NOT NULL DEFAULT 'routine' CHECK (mode IN ('routine','directed')),
  status TEXT NOT NULL CHECK (status IN ('scheduled','sent','opened','answered','expired','cancelled')),
  scheduled_for TEXT, sent_at TEXT, expires_at TEXT, subject_json TEXT, session_id TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS survey_sessions (
  id TEXT PRIMARY KEY, invitation_id TEXT, episode_id TEXT NOT NULL REFERENCES episodes(id),
  participant_id TEXT NOT NULL REFERENCES participants(id), facility_id TEXT NOT NULL REFERENCES facilities(id),
  stage TEXT NOT NULL, mode TEXT NOT NULL DEFAULT 'routine',
  respondent_role TEXT NOT NULL DEFAULT 'self' CHECK (respondent_role IN ('self','companion')), companion_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('scheduled','active','completed','partial','expired','cancelled')),
  revision INTEGER NOT NULL DEFAULT 0, indicator_versions_json TEXT NOT NULL DEFAULT '[]', subject_json TEXT,
  budget_core INTEGER NOT NULL DEFAULT 5, budget_clarif INTEGER NOT NULL DEFAULT 3, core_asked INTEGER NOT NULL DEFAULT 0, clarif_asked INTEGER NOT NULL DEFAULT 0,
  uses_draft INTEGER NOT NULL DEFAULT 1, bank_mode TEXT NOT NULL DEFAULT 'fixed' CHECK (bank_mode IN ('fixed','adaptive_clarify')),
  ai_mode_last TEXT, pending_next_json TEXT, started_at TEXT, last_activity_at TEXT, ended_at TEXT, end_reason TEXT, deadline_at TEXT, is_sandbox INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS survey_turns (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES survey_sessions(id), seq INTEGER NOT NULL,
  question_id TEXT NOT NULL, question_text TEXT NOT NULL,
  question_kind TEXT NOT NULL DEFAULT 'core' CHECK (question_kind IN ('core','clarification','prerequisite')),
  text_source TEXT NOT NULL DEFAULT 'bank' CHECK (text_source IN ('bank','ai_phrase','template')),
  selected_by TEXT NOT NULL DEFAULT 'rules' CHECK (selected_by IN ('rules','ai','fallback')),
  selection_reason TEXT, invocation_id TEXT, asked_at TEXT NOT NULL,
  answer_text TEXT, answer_choice TEXT, answered_at TEXT, idem_key TEXT, attempts INTEGER NOT NULL DEFAULT 0, needs_rephrase INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'asked' CHECK (status IN ('asked','answered','skipped')),
  UNIQUE (session_id, seq), UNIQUE (session_id, idem_key)
);
CREATE TABLE IF NOT EXISTS fact_proposals (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES survey_sessions(id), turn_id TEXT NOT NULL REFERENCES survey_turns(id),
  slot TEXT NOT NULL, subject TEXT, value TEXT NOT NULL, quote TEXT, needs_confirmation INTEGER NOT NULL DEFAULT 1,
  origin TEXT NOT NULL CHECK (origin IN ('choice','rules','ai')),
  validation TEXT NOT NULL CHECK (validation IN ('accepted','rejected')), reject_reason TEXT,
  state TEXT NOT NULL DEFAULT 'proposed' CHECK (state IN ('proposed','confirmed','corrected','dismissed')),
  invocation_id TEXT, created_at TEXT NOT NULL, resolved_at TEXT
);
CREATE TABLE IF NOT EXISTS participant_facts (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES survey_sessions(id), slot TEXT NOT NULL, subject TEXT, value TEXT NOT NULL,
  indicator_id TEXT, source_turn_id TEXT, source_quote TEXT,
  origin TEXT NOT NULL CHECK (origin IN ('choice','confirmed_proposal','correction','context')),
  proposal_id TEXT, status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','superseded')),
  supersedes_id TEXT, revision INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS help_requests (
  id TEXT PRIMARY KEY, session_id TEXT, participant_id TEXT NOT NULL, episode_id TEXT, reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','handled')), channel TEXT, created_at TEXT NOT NULL, handled_by TEXT, handled_at TEXT
);
CREATE TABLE IF NOT EXISTS service_requests (
  id TEXT PRIMARY KEY, participant_id TEXT NOT NULL, episode_id TEXT, facility_id TEXT NOT NULL, category TEXT NOT NULL, text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received','in_review','clarification','action','resolved','closed')),
  case_id TEXT, finding_id TEXT, respondent_role TEXT NOT NULL DEFAULT 'self', created_at TEXT NOT NULL, idem_key TEXT UNIQUE
);

-- ---------- AI ----------
CREATE TABLE IF NOT EXISTS ai_configs (
  version INTEGER PRIMARY KEY AUTOINCREMENT, prompt_version TEXT NOT NULL,
  mode_pref TEXT NOT NULL DEFAULT 'auto' CHECK (mode_pref IN ('auto','simulated','live')),
  provider TEXT NOT NULL DEFAULT 'anthropic', model TEXT NOT NULL, timeout_ms INTEGER NOT NULL DEFAULT 8000,
  max_retries INTEGER NOT NULL DEFAULT 1, budget_core INTEGER NOT NULL DEFAULT 5, budget_clarif INTEGER NOT NULL DEFAULT 3,
  budget_latency_ms INTEGER NOT NULL DEFAULT 12000, bank_mode TEXT NOT NULL DEFAULT 'fixed',
  active INTEGER NOT NULL DEFAULT 0, created_by TEXT, created_at TEXT, note TEXT
);
CREATE TABLE IF NOT EXISTS ai_invocations (
  id TEXT PRIMARY KEY, operation TEXT NOT NULL, session_id TEXT, turn_id TEXT, eval_run_id TEXT, sandbox_id TEXT, case_id TEXT,
  mode TEXT NOT NULL CHECK (mode IN ('live','simulated','fallback')), provider TEXT, model TEXT, prompt_version TEXT, schema_version TEXT,
  config_version INTEGER, started_at TEXT NOT NULL, latency_ms INTEGER,
  status TEXT NOT NULL CHECK (status IN ('ok','invalid','timeout','error','unavailable')), retries INTEGER NOT NULL DEFAULT 0,
  tokens_in INTEGER, tokens_out INTEGER, cost_usd REAL, error_code TEXT, reason_code TEXT,
  request_json TEXT, response_json TEXT, validation_json TEXT, fallback_reason TEXT
);
CREATE TABLE IF NOT EXISTS datasets (id TEXT PRIMARY KEY, name TEXT NOT NULL, version TEXT NOT NULL, kind TEXT, description TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS eval_cases (
  id TEXT PRIMARY KEY, dataset_id TEXT NOT NULL REFERENCES datasets(id), scenario_id TEXT NOT NULL,
  split TEXT NOT NULL CHECK (split IN ('dev','heldout')), stage TEXT NOT NULL, tags TEXT, input_json TEXT NOT NULL, label_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS eval_runs (
  id TEXT PRIMARY KEY, dataset_id TEXT NOT NULL, system TEXT NOT NULL CHECK (system IN ('baseline_rules','rules_plus_llm')),
  mode TEXT NOT NULL, provider TEXT, model TEXT, prompt_version TEXT, config_version INTEGER,
  split TEXT NOT NULL, sample_size INTEGER NOT NULL DEFAULT 0, started_at TEXT, finished_at TEXT,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed')), metrics_json TEXT, note TEXT
);
CREATE TABLE IF NOT EXISTS eval_case_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL, case_id TEXT NOT NULL, output_json TEXT, correct INTEGER,
  failure_types_json TEXT, latency_ms INTEGER
);
CREATE TABLE IF NOT EXISTS sandbox_runs (
  id TEXT PRIMARY KEY, name TEXT, input_json TEXT NOT NULL, config_a_json TEXT, config_b_json TEXT,
  output_a_json TEXT, output_b_json TEXT, corrected_json TEXT, created_by TEXT, created_at TEXT
);

-- ---------- Dokumen & bukti ----------
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY, episode_id TEXT, facility_id TEXT NOT NULL, case_id TEXT, finding_id TEXT, clarification_id TEXT,
  name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, sha256 TEXT NOT NULL, content BLOB,
  kind TEXT NOT NULL CHECK (kind IN ('pdf_text','pdf_scan','image','text','other')), page_count INTEGER,
  processing_status TEXT NOT NULL CHECK (processing_status IN ('uploaded','text_extracted','needs_manual_transcription','ocr_unavailable','reviewed','failed')),
  uploaded_by TEXT NOT NULL, uploaded_role TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS extractions (
  id TEXT PRIMARY KEY, document_id TEXT NOT NULL REFERENCES documents(id), page INTEGER,
  engine TEXT NOT NULL CHECK (engine IN ('pdf_text','ocr','manual','demo_fixture')), text TEXT NOT NULL, simulated INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','confirmed','corrected','rejected')),
  corrected_text TEXT, reviewer TEXT, reviewed_at TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS evidence_links (
  id TEXT PRIMARY KEY, finding_id TEXT NOT NULL, case_id TEXT NOT NULL, evidence_id TEXT, document_id TEXT, extraction_id TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('supports','contradicts','neutral')), quote TEXT, page INTEGER, note TEXT,
  linked_by TEXT NOT NULL, linked_at TEXT NOT NULL
);

-- ---------- Kasus ----------
CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY, episode_id TEXT NOT NULL REFERENCES episodes(id), facility_id TEXT NOT NULL REFERENCES facilities(id),
  lifecycle TEXT NOT NULL CHECK (lifecycle IN ('new','assigned','in_progress','closed','reopened')),
  priority INTEGER NOT NULL DEFAULT 2, assignee_id TEXT, assignee_role TEXT, due_at TEXT, opened_at TEXT NOT NULL,
  first_review_at TEXT, closed_at TEXT, close_reason TEXT
);
CREATE TABLE IF NOT EXISTS findings (
  id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES cases(id), dedupe_key TEXT UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('T1','T2','T3','T4','T5')),
  source TEXT NOT NULL CHECK (source IN ('claim_engine','survey_routine','survey_directed','participant_report','documentation','pending')),
  claim_id TEXT, related_claim_id TEXT, episode_id TEXT NOT NULL, facility_id TEXT NOT NULL, service_id TEXT, indicator_id TEXT,
  title TEXT NOT NULL, summary TEXT NOT NULL, limit_text TEXT, signals_json TEXT NOT NULL DEFAULT '[]',
  score INTEGER NOT NULL DEFAULT 0, tier INTEGER NOT NULL DEFAULT 0, signal_active INTEGER NOT NULL DEFAULT 1,
  proof_status TEXT NOT NULL DEFAULT 'signal' CHECK (proof_status IN ('signal','under_review','awaiting_clarification','verified','not_verified','inconclusive')),
  causes_json TEXT, causes_note TEXT, priority INTEGER NOT NULL DEFAULT 2, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  CHECK (causes_json IS NULL OR proof_status = 'verified')
);
CREATE TABLE IF NOT EXISTS review_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, case_id TEXT NOT NULL, finding_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('proof_proposal','proof_approval','cause','claim_review','fraud_approval','escalation','reopen','close','false_positive')),
  decision TEXT, reason TEXT, correction_amount INTEGER, actor_id TEXT NOT NULL, actor_role TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'recorded' CHECK (state IN ('pending','approved','rejected','recorded')), ref_id INTEGER, simulated INTEGER NOT NULL DEFAULT 0, at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS clarifications (
  id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES cases(id), finding_id TEXT, facility_id TEXT NOT NULL, issue TEXT NOT NULL,
  requested_docs_json TEXT NOT NULL DEFAULT '[]', minimal_ref TEXT, due_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','answered','lapsed','withdrawn')),
  sent_by TEXT NOT NULL, sent_at TEXT NOT NULL, answered_at TEXT, response_text TEXT, lapsed_at TEXT
);
CREATE TABLE IF NOT EXISTS clarification_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT, clarification_id TEXT NOT NULL, author_role TEXT NOT NULL, author_id TEXT NOT NULL,
  text TEXT NOT NULL, document_id TEXT, at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT, case_id TEXT NOT NULL, assignee_id TEXT NOT NULL, assignee_role TEXT NOT NULL,
  assigned_by TEXT NOT NULL, reason TEXT, priority_basis TEXT, at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS disputes (
  id TEXT PRIMARY KEY, facility_id TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('finding','card','pending_category')),
  ref_id TEXT NOT NULL, text TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','accepted','rejected','noted')),
  response TEXT, created_by TEXT, created_at TEXT NOT NULL, resolved_by TEXT, resolved_at TEXT
);
CREATE TABLE IF NOT EXISTS improvement_actions (
  id TEXT PRIMARY KEY, finding_id TEXT, case_id TEXT, facility_id TEXT NOT NULL, indicator_id TEXT, owner TEXT, description TEXT NOT NULL,
  target_date TEXT, status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','follow_up_pending','closed')),
  result TEXT, remeasure_plan TEXT, started_at TEXT, resolved_at TEXT, closed_at TEXT, created_by TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS follow_ups (
  id TEXT PRIMARY KEY, action_id TEXT NOT NULL REFERENCES improvement_actions(id),
  kind TEXT NOT NULL CHECK (kind IN ('participant_confirmation','remeasure','review')), due_at TEXT, participant_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','skipped')),
  outcome TEXT CHECK (outcome IS NULL OR outcome IN ('resolved','still_issue')), note TEXT, created_at TEXT NOT NULL, done_at TEXT
);

-- ---------- Pending, pembayaran, kartu, metrik ----------
CREATE TABLE IF NOT EXISTS pending_triage (
  id TEXT PRIMARY KEY, claim_id TEXT NOT NULL UNIQUE, facility_id TEXT NOT NULL, reason_code TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('doc_completeness','coding','data_mismatch','needs_review')),
  owner_role TEXT, guidance TEXT, pending_since TEXT NOT NULL, facility_response TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','responded','resolved','escalated_to_case')),
  case_id TEXT, resolved_at TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS payment_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, claim_id TEXT NOT NULL, facility_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('submitted','complete','due','paid','pending','returned')), at TEXT NOT NULL, amount INTEGER, reason TEXT,
  source TEXT NOT NULL CHECK (source IN ('simulated','import','live','unavailable')), policy_version_id TEXT
);
CREATE TABLE IF NOT EXISTS policy_versions (
  id TEXT PRIMARY KEY, domain TEXT NOT NULL, version TEXT NOT NULL, params_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','validated')), note TEXT, effective_from TEXT, created_by TEXT, created_at TEXT
);
CREATE TABLE IF NOT EXISTS facility_cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT, facility_id TEXT NOT NULL, period TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('insufficient_data','none','yellow','red')), basis_json TEXT NOT NULL, peer_group TEXT,
  policy_version_id TEXT NOT NULL, computed_at TEXT NOT NULL, UNIQUE (facility_id, period, policy_version_id)
);
CREATE TABLE IF NOT EXISTS metric_definitions (
  id TEXT PRIMARY KEY, metric TEXT NOT NULL, version TEXT NOT NULL, definition TEXT NOT NULL, numerator TEXT, denominator TEXT,
  status TEXT NOT NULL DEFAULT 'draft', note TEXT
);
CREATE TABLE IF NOT EXISTS ground_truth (claim_id TEXT PRIMARY KEY, label TEXT, mimics TEXT);

-- ---------- Impor, idempotensi, audit, meta ----------
CREATE TABLE IF NOT EXISTS import_jobs (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL, file_name TEXT, content_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('previewed','applied','failed')), total_rows INTEGER, valid_rows INTEGER, error_rows INTEGER,
  errors_json TEXT, summary_json TEXT, created_by TEXT, created_at TEXT NOT NULL, applied_at TEXT
);
CREATE TABLE IF NOT EXISTS idempotency_keys (
  scope TEXT NOT NULL, key TEXT NOT NULL, result_json TEXT, created_at TEXT NOT NULL, PRIMARY KEY (scope, key)
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, actor TEXT NOT NULL, actor_role TEXT, action TEXT NOT NULL,
  entity TEXT NOT NULL, entity_id TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '{}', payload_hash TEXT NOT NULL,
  prev_hash TEXT NOT NULL, hash TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit_log bersifat append-only'); END;
CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit_log bersifat append-only'); END;
CREATE TABLE IF NOT EXISTS audit_anchors (
  id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, head_id INTEGER NOT NULL, head_hash TEXT NOT NULL, mac TEXT, note TEXT
);
CREATE TABLE IF NOT EXISTS audit_verifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, actor TEXT, ok INTEGER NOT NULL, total INTEGER NOT NULL, broken_at INTEGER,
  anchors_checked INTEGER NOT NULL DEFAULT 0, anchor_ok INTEGER NOT NULL DEFAULT 1, message TEXT
);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);

CREATE INDEX IF NOT EXISTS idx_ep_part ON episodes(participant_id);
CREATE INDEX IF NOT EXISTS idx_ep_fac ON episodes(facility_id);
CREATE INDEX IF NOT EXISTS idx_svc_ep ON services(episode_id);
CREATE INDEX IF NOT EXISTS idx_ev_ep ON evidence(episode_id);
CREATE INDEX IF NOT EXISTS idx_claim_ep ON claims(episode_id);
CREATE INDEX IF NOT EXISTS idx_claim_fac ON claims(facility_id);
CREATE INDEX IF NOT EXISTS idx_turn_sess ON survey_turns(session_id);
CREATE INDEX IF NOT EXISTS idx_fact_sess ON participant_facts(session_id);
CREATE INDEX IF NOT EXISTS idx_prop_sess ON fact_proposals(session_id);
CREATE INDEX IF NOT EXISTS idx_sess_ep ON survey_sessions(episode_id);
CREATE INDEX IF NOT EXISTS idx_find_case ON findings(case_id);
CREATE INDEX IF NOT EXISTS idx_find_fac ON findings(facility_id);
CREATE INDEX IF NOT EXISTS idx_case_fac ON cases(facility_id);
CREATE INDEX IF NOT EXISTS idx_clar_case ON clarifications(case_id);
CREATE INDEX IF NOT EXISTS idx_aiinv_sess ON ai_invocations(session_id);
CREATE INDEX IF NOT EXISTS idx_pay_claim ON payment_events(claim_id);
`;


const M002 = `
-- Transisi status ditegakkan di basis data (bukan hanya di tampilan).
CREATE TRIGGER IF NOT EXISTS findings_proof_guard BEFORE UPDATE OF proof_status ON findings
WHEN OLD.proof_status <> NEW.proof_status AND NOT (
  (OLD.proof_status = 'signal' AND NEW.proof_status IN ('under_review','awaiting_clarification','not_verified','inconclusive')) OR
  (OLD.proof_status = 'under_review' AND NEW.proof_status IN ('awaiting_clarification','verified','not_verified','inconclusive')) OR
  (OLD.proof_status = 'awaiting_clarification' AND NEW.proof_status = 'under_review') OR
  (OLD.proof_status IN ('verified','not_verified','inconclusive') AND NEW.proof_status = 'under_review')
) BEGIN SELECT RAISE(ABORT, 'transisi status pembuktian tidak diizinkan'); END;

CREATE TRIGGER IF NOT EXISTS actions_status_guard BEFORE UPDATE OF status ON improvement_actions
WHEN OLD.status <> NEW.status AND NOT (
  (OLD.status = 'open' AND NEW.status IN ('in_progress')) OR
  (OLD.status = 'in_progress' AND NEW.status IN ('resolved')) OR
  (OLD.status = 'resolved' AND NEW.status IN ('follow_up_pending','closed')) OR
  (OLD.status = 'follow_up_pending' AND NEW.status IN ('closed','in_progress'))
) BEGIN SELECT RAISE(ABORT, 'transisi status tindakan tidak diizinkan'); END;

CREATE TRIGGER IF NOT EXISTS cases_lifecycle_guard BEFORE UPDATE OF lifecycle ON cases
WHEN OLD.lifecycle <> NEW.lifecycle AND NOT (
  (OLD.lifecycle = 'new' AND NEW.lifecycle IN ('assigned','in_progress','closed')) OR
  (OLD.lifecycle = 'assigned' AND NEW.lifecycle IN ('in_progress','closed')) OR
  (OLD.lifecycle = 'in_progress' AND NEW.lifecycle IN ('assigned','closed')) OR
  (OLD.lifecycle = 'closed' AND NEW.lifecycle = 'reopened') OR
  (OLD.lifecycle = 'reopened' AND NEW.lifecycle IN ('assigned','in_progress','closed'))
) BEGIN SELECT RAISE(ABORT, 'transisi siklus kasus tidak diizinkan'); END;

CREATE TRIGGER IF NOT EXISTS sessions_status_guard BEFORE UPDATE OF status ON survey_sessions
WHEN OLD.status <> NEW.status AND NOT (
  (OLD.status = 'scheduled' AND NEW.status IN ('active','expired','cancelled')) OR
  (OLD.status = 'active' AND NEW.status IN ('completed','partial','expired','cancelled'))
) BEGIN SELECT RAISE(ABORT, 'transisi status sesi survei tidak diizinkan'); END;

CREATE TRIGGER IF NOT EXISTS clarifications_status_guard BEFORE UPDATE OF status ON clarifications
WHEN OLD.status <> NEW.status AND NOT (
  (OLD.status = 'sent' AND NEW.status IN ('answered','lapsed','withdrawn')) OR
  (OLD.status = 'lapsed' AND NEW.status = 'answered')
) BEGIN SELECT RAISE(ABORT, 'transisi status klarifikasi tidak diizinkan'); END;

-- Fakta peserta tidak pernah dihapus; hanya diganti (superseded) agar jejak koreksi tetap ada.
CREATE TRIGGER IF NOT EXISTS facts_no_delete BEFORE DELETE ON participant_facts BEGIN SELECT RAISE(ABORT, 'participant_facts tidak boleh dihapus; gunakan status superseded'); END;
`;

const M003 = `
-- Kotak keluar notifikasi (adapter simulasi). Tidak mengirim ke kanal nyata.
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT, to_role TEXT NOT NULL, to_id TEXT, topic TEXT NOT NULL, body TEXT NOT NULL,
  ref_type TEXT, ref_id TEXT, mode TEXT NOT NULL CHECK (mode IN ('simulated','live')), created_at TEXT NOT NULL, read_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_notif_to ON notifications(to_role, to_id);
`;

export const MIGRATIONS: { id: string; sql: string }[] = [
  { id: "001_core", sql: M001 },
  { id: "002_guards", sql: M002 },
  { id: "003_notifications", sql: M003 },
  { id: "004_pkbi", sql: M004_PKBI },
];
