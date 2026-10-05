import { runAutopilot, setMode, type AutoMode } from "@/lib/autopilot";
import { getDb } from "@/lib/db";
import { getRole, readJson, run, str } from "@/lib/server";

/** Ganti mode keputusan. Menyalakan mode otomatis langsung memproses antrean yang ada. */
export async function POST(req: Request) {
  return run(async () => {
    const body = await readJson(req);
    const db = getDb();
    const mode = str(body.mode) as AutoMode;
    setMode(db, mode, await getRole());
    return mode === "otomatis" ? runAutopilot(db) : null;
  });
}
