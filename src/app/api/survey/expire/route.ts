import { assertCan } from "@/lib/auth/principal";
import { getDb } from "@/lib/db";
import { expireStale } from "@/lib/survey/service";
import { getPrincipal, run } from "@/lib/server";

export async function POST() {
  return run(async () => {
    const p = await getPrincipal("konsol");
    assertCan(p, "ai.config");
    return expireStale(getDb(), p);
  });
}
