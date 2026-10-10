import { getDb } from "@/lib/db";
import { indicatorCsv, normalizeFilters, qualityDashboard } from "@/lib/quality/metrics";
import { errorResponse, getPrincipal } from "@/lib/server";

/** GET ?from&to&facility&care&stage&indicator → CSV tabel indikator (hanya agregat; tanpa data pribadi). Wewenang quality.view dicek di qualityDashboard. */
export async function GET(req: Request) {
  try {
    const p = await getPrincipal("konsol");
    const url = new URL(req.url);
    const f = normalizeFilters(Object.fromEntries(url.searchParams.entries()));
    const d = qualityDashboard(getDb(), p, { ...f, mode: "routine" });
    return new Response(indicatorCsv(d), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="sehati-gap-per-indikator.csv"', "cache-control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
