import { beforeAll, describe, expect, it } from "vitest";
import { anchorAudit, appendAudit, verifyChain } from "../src/lib/audit";
import { AuthError, assertCan, assertFacility, assertParticipant, can, ROLES, type Capability, type Principal } from "../src/lib/auth/principal";
import { openDb } from "../src/lib/db";
import { seedAll } from "../src/lib/seed";
import { ACTION_TRANSITIONS, CLARIFICATION_TRANSITIONS, LIFECYCLE_TRANSITIONS, PROOF_TRANSITIONS, SESSION_TRANSITIONS, canMove } from "../src/lib/domain/transitions";
import { evalRule, unknownFields } from "../src/lib/standards/applicability";
import { applyStandardImport, createDraftFrom, loadBank, transitionStandard, updateQuestionText, validateStandardImport, RegistryError } from "../src/lib/standards/registry";
import { computeAgenda } from "../src/lib/survey/engine";
import { setNow } from "../src/lib/clock";
import type { Rule } from "../src/lib/standards/types";

const P = (id: string, role: Principal["role"], over: Partial<Principal> = {}): Principal => ({ id: `${role}:${id}`, name: id, role, facilityId: null, participantId: null, companionId: null, ...over });
const admin = P("U-ADM-1", "admin");
const rev = P("U-REV-1", "reviewer");
const ver = P("U-VER-1", "verifikator");

describe("paritas tabel transisi ↔ trigger basis data", () => {
  const db = openDb(":memory:");
  const cases: [string, string, string, Record<string, string[]>, (id: string, s: string) => void][] = [
    ["findings", "proof_status", "x", PROOF_TRANSITIONS, (id, s) => db.prepare("INSERT INTO findings (id, case_id, type, source, episode_id, facility_id, title, summary, proof_status, created_at, updated_at) VALUES (?, 'C', 'T5', 'documentation', 'E', 'F', 't', 's', ?, 'n', 'n')").run(id, s)],
    ["improvement_actions", "status", "x", ACTION_TRANSITIONS, (id, s) => db.prepare("INSERT INTO improvement_actions (id, facility_id, description, status, created_at) VALUES (?, 'F', 'd', ?, 'n')").run(id, s)],
    ["cases", "lifecycle", "x", LIFECYCLE_TRANSITIONS, (id, s) => db.prepare("INSERT INTO cases (id, episode_id, facility_id, lifecycle, opened_at) VALUES (?, 'E', 'F', ?, 'n')").run(id, s)],
    ["survey_sessions", "status", "x", SESSION_TRANSITIONS, (id, s) => db.prepare("INSERT INTO survey_sessions (id, episode_id, participant_id, facility_id, stage, status) VALUES (?, 'E', 'P', 'F', 'pre', ?)").run(id, s)],
    ["clarifications", "status", "x", CLARIFICATION_TRANSITIONS, (id, s) => db.prepare("INSERT INTO clarifications (id, case_id, facility_id, issue, due_at, status, sent_by, sent_at) VALUES (?, 'C', 'F', 'i', 'n', ?, 'u', 'n')").run(id, s)],
  ];
  for (const [table, col, , tbl, ins] of cases) {
    it(`${table}.${col}: semua pasangan (dari, ke) sama dengan tabel domain`, () => {
      let n = 0;
      for (const from of Object.keys(tbl)) {
        for (const to of Object.keys(tbl)) {
          if (from === to) continue;
          const id = `T-${table}-${n++}`;
          ins(id, from);
          let allowed = true;
          try {
            db.prepare(`UPDATE ${table} SET ${col} = ? WHERE id = ?`).run(to, id);
          } catch {
            allowed = false;
          }
          expect(allowed, `${table}: ${from} → ${to}`).toBe(canMove(tbl, from, to));
        }
      }
      expect(n).toBeGreaterThan(5);
    });
  }
});

describe("hak akses (RBAC)", () => {
  const db = openDb(":memory:");
  beforeAll(() => seedAll(db));
  it("hanya admin yang memegang wewenang konfigurasi AI, persetujuan standar, dan impor", () => {
    for (const cap of ["ai.config", "standards.approve", "import.run"] as Capability[]) {
      expect(ROLES.filter((r) => can(P("x", r), cap))).toEqual(["admin"]);
    }
  });
  it("peserta dan pendamping tidak punya wewenang kerja petugas", () => {
    for (const r of ["peserta", "pendamping"] as const) for (const cap of ["case.view", "case.work", "standards.edit", "audit.view"] as Capability[]) expect(can(P("x", r), cap)).toBe(false);
  });
  it("faskes ditolak lintas faskes dan peserta ditolak mengakses data faskes", () => {
    const f = P("f", "faskes", { facilityId: "FAC-RSHB" });
    expect(() => assertFacility(f, "FAC-RSHB")).not.toThrow();
    expect(() => assertFacility(f, "FAC-RSNM")).toThrow(AuthError);
    expect(() => assertFacility(P("p", "peserta", { participantId: "P-0001" }), "FAC-RSHB")).toThrow(AuthError);
    expect(() => assertFacility(ver, "FAC-RSNM")).not.toThrow();
  });
  it("peserta hanya data sendiri; pendamping hanya bila diotorisasi", () => {
    const sari = P("U-PSR-1", "peserta", { participantId: "P-0001" });
    expect(() => assertParticipant(db, sari, "P-0001")).not.toThrow();
    expect(() => assertParticipant(db, sari, "P-0002")).toThrow(AuthError);
    const comp = P("c", "pendamping", { participantId: "P-0001", companionId: "NOPE" });
    expect(() => assertParticipant(db, comp, "P-0001")).toThrow(AuthError);
    expect(() => assertCan(sari, "case.work")).toThrow(AuthError);
  });
});

describe("jejak audit: deteksi perubahan", () => {
  it("rantai valid, lalu ketahuan bila isi diubah setelah pengaman dilepas, dan jangkar menangkap penulisan ulang", () => {
    const db = openDb(":memory:");
    for (let i = 0; i < 5; i++) appendAudit(db, { actor: "sistem", action: "uji", entity: "x", entity_id: String(i), detail: { i } });
    anchorAudit(db, "uji");
    expect(verifyChain(db).ok).toBe(true);
    db.exec("DROP TRIGGER IF EXISTS audit_no_update");
    const trig = (db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name='audit_log'").all() as { name: string }[]).map((t) => t.name);
    for (const t of trig) db.exec(`DROP TRIGGER "${t}"`);
    db.prepare("UPDATE audit_log SET detail = '{\"i\":99}' WHERE id = 3").run();
    const bad = verifyChain(db);
    expect(bad.ok).toBe(false);
    expect(bad.brokenAt).toBe(3);
  });
  it("penulisan ulang total (hash dihitung ulang) ketahuan oleh jangkar", () => {
    const db = openDb(":memory:");
    for (let i = 0; i < 3; i++) appendAudit(db, { actor: "sistem", action: "uji", entity: "x", entity_id: String(i), detail: { i } });
    anchorAudit(db);
    const trig = (db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name='audit_log'").all() as { name: string }[]).map((t) => t.name);
    for (const t of trig) db.exec(`DROP TRIGGER "${t}"`);
    db.exec("DELETE FROM audit_log WHERE id = 3");
    const v = verifyChain(db);
    // rantai internal masih konsisten (entri terakhir dibuang), tetapi jangkar menunjuk entri #3
    expect(v.ok).toBe(false);
    expect(v.anchorOk).toBe(false);
  });
});

describe("applicability tiga nilai", () => {
  const eq = (f: string, v: string | boolean): Rule => ({ field: f, operator: "eq", value: v } as Rule);
  it("bidang tidak ada atau 'unknown' → unknown, bukan no", () => {
    expect(evalRule(eq("lab_performed", true), {})).toBe("unknown");
    expect(evalRule(eq("a", "x"), { a: "unknown" })).toBe("unknown");
    expect(evalRule(eq("a", "x"), { a: "not_understood" })).toBe("unknown");
  });
  it("all/any/not mengikuti logika tiga nilai", () => {
    expect(evalRule({ all: [eq("a", "x"), eq("b", "y")] } as Rule, { a: "z" })).toBe("no");
    expect(evalRule({ all: [eq("a", "x"), eq("b", "y")] } as Rule, { a: "x" })).toBe("unknown");
    expect(evalRule({ any: [eq("a", "x"), eq("b", "y")] } as Rule, { a: "x" })).toBe("yes");
    expect(evalRule({ not: eq("a", "x") } as Rule, {})).toBe("unknown");
    expect(unknownFields({ all: [eq("a", "x"), eq("b", "y")] } as Rule, { a: "x" })).toEqual(["b"]);
    expect(evalRule(null, {})).toBe("yes");
  });
});

describe("registry standar", () => {
  const db = openDb(":memory:");
  beforeAll(() => { setNow("2026-10-10T09:00"); seedAll(db); });
  const first = () => (db.prepare("SELECT id, status FROM standard_versions ORDER BY id").all() as { id: string; status: string }[]);

  it("bank mengandung butir dengan sumber; setiap pertanyaan menunjuk butir yang ada", () => {
    const bank = loadBank(db);
    expect(bank.indicators.length).toBeGreaterThan(10);
    const ids = new Set(bank.indicators.map((i) => i.id));
    expect(bank.questions.every((q) => ids.has(q.indicator_version_id))).toBe(true);
  });
  it("impor menolak bentuk tidak valid dan field tak dikenal", () => {
    const r = validateStandardImport(db, { standard_id: "STD-X", name: "abc", version: "1", scope: [], indicators: [], tambahan: 1 });
    expect(r.ok).toBe(false);
  });
  it("draft baru dapat disalin, diedit hanya sebagai draft, dan transisi mengikuti peran + catatan", () => {
    const src = first().find((v) => v.status !== "draft") ?? first()[0];
    const id = createDraftFrom(db, admin, src.id, "9.9");
    const q = db.prepare("SELECT q.id FROM question_versions q JOIN indicator_versions i ON i.id = q.indicator_version_id WHERE i.standard_version_id = ? LIMIT 1").get(id) as { id: string };
    updateQuestionText(db, admin, q.id, "Apakah Anda diberi penjelasan tentang pemeriksaan tadi?");
    expect(() => updateQuestionText(db, ver, q.id, "Apakah Anda diberi penjelasan lain?")).toThrow(AuthError);
    expect(() => transitionStandard(db, ver, id, "reviewed", "cek")).toThrow(AuthError);
    expect(() => transitionStandard(db, rev, id, "approved", "langsung setuju")).toThrow(RegistryError);
    expect(() => transitionStandard(db, rev, id, "reviewed", "x")).toThrow(/Catatan/);
    transitionStandard(db, rev, id, "reviewed", "Sudah ditinjau tim klinis.");
    expect(() => updateQuestionText(db, admin, q.id, "Apakah Anda sudah diberi tahu hasilnya?")).toThrow();
    transitionStandard(db, admin, id, "approved", "Disetujui tim SEHATI.");
    expect((db.prepare("SELECT status FROM standard_versions WHERE id = ?").get(id) as { status: string }).status).toBe("approved");
  });
  it("impor yang identik tidak menggandakan versi", () => {
    const src = { standard_id: "STD-TES", name: "Standar uji", version: "1.0", scope: ["fkrtl"], indicators: [{ indicator_id: "TES_1", title: "Butir uji", kind: "existence", stage: "post", scope: [], required_slots: ["s1"], slots: [{ id: "s1", label: "Slot 1", values: ["yes", "no"] }], observable_by_patient: true, source_id: null, locator: null, questions: [{ id: "TES_1_Q1", slot: "s1", text: "Apakah layanan uji Anda terima?" }] }] };
    const v = validateStandardImport(db, src);
    expect(v.data, JSON.stringify(v.issues)).toBeTruthy();
    expect(applyStandardImport(db, admin, v.data!).created).toBe(true);
    expect(applyStandardImport(db, admin, v.data!).created).toBe(false);
  });
});

describe("agenda survei (mesin murni)", () => {
  const db = openDb(":memory:");
  beforeAll(() => seedAll(db));
  it("mematuhi anggaran inti dan tidak mengulang pertanyaan yang sudah ditanya", () => {
    const bank = loadBank(db, { stages: ["post"] });
    const base = { stage: "post" as const, indicators: bank.indicators, questions: bank.questions, scopeTags: ["hospital", "inpatient_discharge"], context: { lab_performed: true, prescription_expected: true, discharge_prescription_expected: true }, facts: {}, asked: [] as string[], coreAsked: 0, clarifAsked: 0, budgetCore: 3, budgetClarif: 2 };
    const a = computeAgenda(base);
    expect(a.candidates.length).toBeGreaterThan(0);
    const firstQ = a.candidates[0].question.id;
    const b = computeAgenda({ ...base, asked: [firstQ], coreAsked: 1 });
    expect(b.candidates.some((c) => c.question.id === firstQ)).toBe(false);
    const c = computeAgenda({ ...base, coreAsked: 3 });
    expect(c.eligible.filter((x) => x.kind === "core")).toHaveLength(0);
    expect(c.overBudget.length).toBeGreaterThan(0);
  });
});
