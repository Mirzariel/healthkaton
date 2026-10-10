import { createDraftFrom } from "@/lib/standards/registry";
import { getDb } from "@/lib/db";
import { DomainError } from "@/lib/idem";
import { getPrincipal, readJson, run, str } from "@/lib/server";

/** Salin versi menjadi draft baru: POST { version }. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return run(async () => {
    const { id } = await ctx.params;
    const p = await getPrincipal("konsol");
    const version = str((await readJson(req)).version).trim();
    if (!/^[A-Za-z0-9._-]{1,24}$/.test(version)) throw new DomainError("Nomor versi tidak valid (huruf, angka, titik, strip; maks 24).", 422);
    return { id: createDraftFrom(getDb(), p, decodeURIComponent(id), version) };
  });
}
