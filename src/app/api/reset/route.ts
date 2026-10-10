import { assertCan } from "@/lib/auth/principal";
import { getDb, resetDb } from "@/lib/db";
import { DomainError } from "@/lib/idem";
import { demoRolesEnabled, getPrincipal, run } from "@/lib/server";

/** Atur ulang data demo sintetis. Hanya admin, dan hanya bila mode demo aktif (SEHATI_DEMO_ROLES != 0). */
export async function POST() {
  return run(async () => {
    const p = await getPrincipal("konsol");
    assertCan(p, "ai.config");
    if (!demoRolesEnabled()) throw new DomainError("Atur ulang data dinonaktifkan pada lingkungan ini.", 403);
    resetDb(getDb());
    return { reset: true };
  });
}
