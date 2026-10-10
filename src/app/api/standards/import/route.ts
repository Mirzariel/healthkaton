import { applyStandardImport, validateStandardImport } from "@/lib/standards/registry";
import { assertCan } from "@/lib/auth/principal";
import { getDb } from "@/lib/db";
import { DomainError } from "@/lib/idem";
import { getPrincipal, readJson, run } from "@/lib/server";

/** POST { json: object|string, dryRun?: boolean }. Pratinjau (dryRun) memvalidasi tanpa menulis; tanpa dryRun membuat versi DRAFT. */
export async function POST(req: Request) {
  return run(async () => {
    const p = await getPrincipal("konsol");
    assertCan(p, "standards.edit");
    const b = await readJson(req);
    let raw: unknown = b.json;
    if (typeof b.json === "string") {
      try { raw = JSON.parse(b.json); } catch { throw new DomainError("Isi bukan JSON yang valid.", 422); }
    }
    const v = validateStandardImport(getDb(), raw);
    if (b.dryRun || !v.ok || !v.data) return { applied: false, ok: v.ok, issues: v.issues, summary: v.data ? { id: `${v.data.standard_id}@${v.data.version}`, indikator: v.data.indicators.length } : null };
    const r = applyStandardImport(getDb(), p, v.data);
    return { applied: true, ok: true, issues: v.issues, ...r };
  });
}
