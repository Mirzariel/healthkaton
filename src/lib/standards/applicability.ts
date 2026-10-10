import type { CompareOp, Rule } from "./types";

/** Hasil tiga nilai: bidang yang belum diketahui menghasilkan "unknown" (perlu klarifikasi), bukan "no". */
export type Tri = "yes" | "no" | "unknown";

export type RuleContext = Record<string, string | number | boolean | null | undefined>;

function cmp(op: CompareOp, actual: unknown, value: unknown, values: unknown[] | undefined): Tri {
  if (op === "exists") return actual === undefined || actual === null ? "no" : "yes";
  if (actual === undefined || actual === null) return "unknown";
  // 'unknown' / 'not_understood' sebagai nilai fakta berarti belum diketahui bagi aturan penerapan
  if (actual === "unknown" || actual === "not_understood") return "unknown";
  switch (op) {
    case "eq":
      return actual === value ? "yes" : "no";
    case "neq":
      return actual !== value ? "yes" : "no";
    case "in":
      return (values ?? []).includes(actual as never) ? "yes" : "no";
    case "nin":
      return !(values ?? []).includes(actual as never) ? "yes" : "no";
    case "gt":
      return Number(actual) > Number(value) ? "yes" : "no";
    case "lt":
      return Number(actual) < Number(value) ? "yes" : "no";
    default:
      return "unknown";
  }
}

/** Evaluasi aturan sebagai data. Tidak pernah menjalankan string sebagai kode. */
export function evalRule(rule: Rule | null | undefined, ctx: RuleContext): Tri {
  if (!rule) return "yes";
  if ("all" in rule) {
    const rs = rule.all.map((r) => evalRule(r, ctx));
    return rs.includes("no") ? "no" : rs.includes("unknown") ? "unknown" : "yes";
  }
  if ("any" in rule) {
    const rs = rule.any.map((r) => evalRule(r, ctx));
    return rs.includes("yes") ? "yes" : rs.includes("unknown") ? "unknown" : "no";
  }
  if ("not" in rule) {
    const r = evalRule(rule.not, ctx);
    return r === "yes" ? "no" : r === "no" ? "yes" : "unknown";
  }
  return cmp(rule.operator, ctx[rule.field], rule.value, rule.values);
}

/** Bidang yang membuat aturan masih "unknown" (untuk memilih pertanyaan prasyarat). */
export function unknownFields(rule: Rule | null | undefined, ctx: RuleContext): string[] {
  if (!rule) return [];
  if ("all" in rule) return rule.all.flatMap((r) => unknownFields(r, ctx));
  if ("any" in rule) return rule.any.flatMap((r) => unknownFields(r, ctx));
  if ("not" in rule) return unknownFields(rule.not, ctx);
  return evalRule(rule, ctx) === "unknown" ? [rule.field] : [];
}

const OPS: CompareOp[] = ["eq", "neq", "in", "nin", "exists", "gt", "lt"];

/** Validasi bentuk aturan (dipakai impor/editor). Mengembalikan daftar masalah. */
export function validateRule(rule: unknown, path = "aturan"): string[] {
  const errs: string[] = [];
  if (rule === null || rule === undefined) return errs;
  if (typeof rule !== "object") return [`${path}: harus objek`];
  const r = rule as Record<string, unknown>;
  const keys = Object.keys(r);
  if ("all" in r || "any" in r) {
    const k = "all" in r ? "all" : "any";
    if (!Array.isArray(r[k])) return [`${path}.${k}: harus larik`];
    (r[k] as unknown[]).forEach((x, i) => errs.push(...validateRule(x, `${path}.${k}[${i}]`)));
    return errs;
  }
  if ("not" in r) return validateRule(r.not, `${path}.not`);
  const allowed = new Set(["field", "operator", "value", "values"]);
  for (const k of keys) if (!allowed.has(k)) errs.push(`${path}: bidang tidak dikenal "${k}"`);
  if (typeof r.field !== "string" || !/^[a-z][a-z0-9_]*$/.test(r.field)) errs.push(`${path}.field: harus nama bidang huruf kecil_dengan_garis_bawah`);
  if (!OPS.includes(r.operator as CompareOp)) errs.push(`${path}.operator: salah satu dari ${OPS.join(", ")}`);
  if ((r.operator === "in" || r.operator === "nin") && !Array.isArray(r.values)) errs.push(`${path}.values: wajib larik untuk ${String(r.operator)}`);
  return errs;
}
