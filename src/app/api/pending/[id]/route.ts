import { getDb } from "@/lib/db";
import { DomainError } from "@/lib/idem";
import { fileDispute } from "@/lib/pending/dispute";
import { PENDING_CATEGORIES, escalatePendingToCase, reclassifyPending, resolvePending, respondPending, type PendingCategory } from "@/lib/pending/triage";
import { getPrincipal, readJson, run, str } from "@/lib/server";

/** POST { action } — petugas: reclassify {category, reason} | resolve {note} | escalate {reason}. Faskes (?as=faskes): respond {text, documentId?} | dispute {text}. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return run(async () => {
    const { id } = await ctx.params;
    const b = await readJson(req);
    const action = str(b.action);
    const db = getDb();
    const faskes = new URL(req.url).searchParams.get("as") === "faskes";
    if (faskes) {
      const p = await getPrincipal("faskes");
      if (action === "respond") return respondPending(db, p, id, str(b.text), str(b.documentId) || null);
      if (action === "dispute") return { id: fileDispute(db, p, { kind: "pending_category", refId: id, text: str(b.text) }) };
      throw new DomainError("Aksi tidak dikenal untuk faskes.", 422);
    }
    const p = await getPrincipal("konsol");
    if (action === "reclassify") {
      const category = str(b.category) as PendingCategory;
      if (!PENDING_CATEGORIES.includes(category)) throw new DomainError("Kategori tidak dikenal.", 422);
      return { category: reclassifyPending(db, p, id, category, str(b.reason)) };
    }
    if (action === "resolve") return resolvePending(db, p, id, str(b.note));
    if (action === "escalate") return escalatePendingToCase(db, p, id, str(b.reason));
    throw new DomainError("Aksi tidak dikenal.", 422);
  });
}
