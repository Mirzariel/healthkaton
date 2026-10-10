import { handleUpload } from "@/lib/casework/upload";
import { getDb } from "@/lib/db";
import { AuthError } from "@/lib/auth/principal";
import { getPrincipal, run } from "@/lib/server";

/** POST multipart: file, clarificationId? atau findingId?. Selalu atas nama faskes pemanggil. */
export async function POST(req: Request) {
  return run(async () => {
    const p = await getPrincipal("faskes");
    if (!p.facilityId) throw new AuthError("Akun ini tidak terkait faskes.");
    return handleUpload(getDb(), p, await req.formData(), p.facilityId);
  });
}
