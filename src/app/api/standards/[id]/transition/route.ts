import { transitionStandard } from "@/lib/standards/registry";
import type { StandardStatus } from "@/lib/standards/types";
import { getDb } from "@/lib/db";
import { DomainError } from "@/lib/idem";
import { getPrincipal, readJson, run, str } from "@/lib/server";

const TO: StandardStatus[] = ["draft", "reviewed", "approved", "retired"];

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return run(async () => {
    const { id } = await ctx.params;
    const p = await getPrincipal("konsol");
    const b = await readJson(req);
    const to = str(b.to) as StandardStatus;
    if (!TO.includes(to)) throw new DomainError("Status tujuan tidak dikenal.", 422);
    transitionStandard(getDb(), p, decodeURIComponent(id), to, str(b.note));
    return { id: decodeURIComponent(id), status: to };
  });
}
