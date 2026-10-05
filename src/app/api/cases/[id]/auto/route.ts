import { ActionError } from "@/lib/actions";
import { confirmAuto, overrideAuto, reopenAuto } from "@/lib/autopilot";
import { getDb } from "@/lib/db";
import { getRole, readJson, run, str } from "@/lib/server";

/** Tinjauan manusia atas keputusan otomatis: konfirmasi, ubah, atau kembalikan ke antrean manual. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return run(async () => {
    const b = await readJson(req);
    const db = getDb();
    const role = await getRole();
    const action = str(b.action);
    if (action === "confirm") confirmAuto(db, id, role, str(b.note));
    else if (action === "override") {
      const correction = typeof b.correction === "number" ? b.correction : Number(str(b.correction)) || 0;
      overrideAuto(db, id, { decision: str(b.decision), reason: str(b.reason), correction }, role);
    } else if (action === "reopen") reopenAuto(db, id, role, str(b.note));
    else throw new ActionError("Aksi tidak dikenal.");
    return {};
  });
}
