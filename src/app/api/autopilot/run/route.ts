import { ActionError } from "@/lib/actions";
import { runAutopilot } from "@/lib/autopilot";
import { getDb } from "@/lib/db";
import { getRole, run } from "@/lib/server";

/** Proses semua kasus yang belum diputus sekarang juga. */
export async function POST() {
  return run(async () => {
    const role = await getRole();
    if (role !== "verifikator" && role !== "auditor") throw new ActionError("Hanya verifikator atau auditor yang dapat menjalankan autopilot.", 403);
    return runAutopilot(getDb());
  });
}
