import { handleUpload } from "@/lib/casework/upload";
import { getDb } from "@/lib/db";
import { DomainError } from "@/lib/idem";
import { getPrincipal, run } from "@/lib/server";

/** POST multipart oleh petugas: file, facilityId, findingId?. Dipakai bila faskes menyerahkan dokumen di luar portal (mis. kunjungan). */
export async function POST(req: Request) {
  return run(async () => {
    const p = await getPrincipal("konsol");
    const form = await req.formData();
    const facilityId = form.get("facilityId");
    if (typeof facilityId !== "string" || !facilityId) throw new DomainError("Faskes pemilik dokumen wajib dipilih.", 422);
    return handleUpload(getDb(), p, form, facilityId);
  });
}
