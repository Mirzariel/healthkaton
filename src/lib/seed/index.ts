import type Database from "better-sqlite3";
import { setNow } from "../clock";
import { seedStandards } from "../standards/registry";
import { SEED_NOW, seedBase } from "./base";
import { seedDomain } from "./domain";
import { seedSurvey } from "../survey/seed";

export { SEED_NOW };

export const DEMO_CARD_PARAMS = {
  label: "PARAMETER DEMO. Bukan ketentuan BPJS Kesehatan. Wajib divalidasi sebelum dipakai di luar demo.",
  min_claims: 20,
  min_responses: 15,
  min_peers: 2,
  yellow_ratio: 1.5,
  red_ratio: 2.5,
  min_metrics_for_red: 2,
  floor: { pending_rate: 0.05, verified_per_100: 1, gap_rate: 0.1, lapsed_share: 0.1 },
};
export const DEMO_PAYMENT_PARAMS = {
  label: "PARAMETER DEMO. Ketentuan tenggat resmi belum tersedia (lihat sumber P4); nilai ini placeholder untuk memperagakan dasbor.",
  due_days_after_complete: 15,
  complete_after_submit_days: 2,
};

/** Mengisi basis data kosong dengan data simulasi yang konsisten. Memanggil modul domain agar jejak audit sah. */
export function seedAll(db: Database.Database) {
  setNow(SEED_NOW);
  try {
    seedStandards(db, SEED_NOW);
    db.prepare("INSERT INTO ai_configs (prompt_version, mode_pref, provider, model, timeout_ms, max_retries, budget_core, budget_clarif, budget_latency_ms, bank_mode, active, created_by, created_at, note) VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?,?)").run(
      "interview-v1", "auto", "anthropic", process.env.SEHATI_AI_MODEL || "claude-sonnet-5-5", 8000, 1, 5, 3, 12000, "fixed", "sistem", SEED_NOW,
      "Konfigurasi awal. Mode 'auto': AI langsung bila kunci tersedia di server, selain itu simulasi berlabel.",
    );
    db.prepare("INSERT INTO policy_versions (id, domain, version, params_json, status, note, effective_from, created_by, created_at) VALUES ('POL-CARD-1','card','demo-1',?,'draft',?,?,?,?)").run(JSON.stringify(DEMO_CARD_PARAMS), DEMO_CARD_PARAMS.label, "2026-07-01", "sistem", SEED_NOW);
    db.prepare("INSERT INTO policy_versions (id, domain, version, params_json, status, note, effective_from, created_by, created_at) VALUES ('POL-PAY-1','payment','demo-1',?,'draft',?,?,?,?)").run(JSON.stringify(DEMO_PAYMENT_PARAMS), DEMO_PAYMENT_PARAMS.label, "2026-01-01", "sistem", SEED_NOW);
    const refs = seedBase(db);
    seedDomain(db, refs);
    seedSurvey(db, refs.hero);
  } finally {
    setNow(null);
  }
}
