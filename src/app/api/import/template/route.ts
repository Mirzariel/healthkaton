import { CSV_TEMPLATE } from "@/lib/csv";

export async function GET() {
  return new Response(CSV_TEMPLATE, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="sehati-templat-impor.csv"',
    },
  });
}
