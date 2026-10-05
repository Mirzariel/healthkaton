import { autopilotAfterChange } from "@/lib/autopilot";
import { importCsv } from "@/lib/csv";
import { getDb } from "@/lib/db";

export async function POST(req: Request) {
  const text = await req.text();
  if (text.length > 5_000_000) {
    return Response.json({ ok: false, errors: [{ line: 1, message: "Berkas terlalu besar (maks. 5 MB)." }] }, { status: 413 });
  }
  const db = getDb();
  const result = importCsv(db, text);
  // Mode otomatis: kasus baru dari impor langsung diputus.
  const auto = result.ok ? autopilotAfterChange(db) : null;
  return Response.json({ ...result, auto }, { status: result.ok ? 200 : 422 });
}
