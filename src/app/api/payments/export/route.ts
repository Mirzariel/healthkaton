import { assertCan } from "@/lib/auth/principal";
import { getDb } from "@/lib/db";
import { toCsv } from "@/lib/import/csv";
import { PAY_CLASS_LABEL, getPaymentPolicy, listClaimPayments, type PayClass } from "@/lib/payments/analysis";
import { getPrincipal } from "@/lib/server";
import { errorResponse } from "@/lib/server";

/** GET ?facility=&class=&period=YYYY-MM: ekspor CSV tabel pembayaran (dengan sumber dan basis tenggat). */
export async function GET(req: Request) {
  try {
    const p = await getPrincipal("konsol");
    assertCan(p, "payments.view");
    const u = new URL(req.url).searchParams;
    const klass = u.get("class") as PayClass | null;
    const db = getDb();
    const rows = listClaimPayments(db, { facilityId: u.get("facility") || undefined, klass: klass && klass in PAY_CLASS_LABEL ? klass : undefined, period: u.get("period") || undefined });
    const policy = getPaymentPolicy(db);
    const csv = toCsv([
      ["claim_no", "faskes", "diajukan", "berkas_lengkap", "tenggat", "dasar_tenggat", "dibayar", "hari_ke_bayar", "klasifikasi", "sumber", "catatan"],
      ...rows.map((r) => [r.claim_no, r.facility_id, r.submitted_at, r.complete_at, r.due_at, r.due_basis, r.paid_at, r.days_to_pay, PAY_CLASS_LABEL[r.klass].label, r.source, policy?.status === "draft" ? "tenggat menurut parameter demo (draft)" : ""]),
    ]);
    return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="pembayaran-sehati.csv"', "x-content-type-options": "nosniff" } });
  } catch (e) {
    return errorResponse(e);
  }
}
