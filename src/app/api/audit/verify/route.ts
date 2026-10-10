import { anchorAudit, verifyChain } from "@/lib/audit";
import { assertCan } from "@/lib/auth/principal";
import { getDb } from "@/lib/db";
import { getPrincipal, readJson, run } from "@/lib/server";

/** POST { anchor?: boolean }: verifikasi rantai (dicatat di audit_verifications); anchor=true menulis jangkar baru lebih dulu. */
export async function POST(req: Request) {
  return run(async () => {
    const p = await getPrincipal("konsol");
    assertCan(p, "audit.verify");
    const b = await readJson(req);
    const anchor = b.anchor ? anchorAudit(getDb(), `manual:${p.id}`) : null;
    return { check: verifyChain(getDb(), p.id), anchor };
  });
}
