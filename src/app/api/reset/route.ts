import { resetDb } from "@/lib/db";
import { run } from "@/lib/server";

// Mengembalikan data demo ke kondisi awal (hanya data simulasi).
export async function POST() {
  return run(() => {
    resetDb();
    return {};
  });
}
