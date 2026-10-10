import { getDb } from "@/lib/db";
import { DomainError } from "@/lib/idem";
import { resolveProposal } from "@/lib/survey/service";
import { getPrincipal, num, readJson, run, str } from "@/lib/server";

export async function POST(req: Request, ctx: { params: Promise<{ id: string; pid: string }> }) {
  return run(async () => {
    const { id, pid } = await ctx.params;
    const p = await getPrincipal("peserta");
    const b = await readJson(req);
    const action = str(b.action);
    if (!["confirm", "correct", "dismiss"].includes(action)) throw new DomainError("Aksi tidak dikenal.", 422);
    return resolveProposal(getDb(), p, { session_id: id, proposal_id: pid, action: action as "confirm" | "correct" | "dismiss", value: str(b.value) || undefined, revision: num(b.revision), idem_key: str(b.idem_key) || undefined });
  });
}
