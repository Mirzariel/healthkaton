import { SummaryLab, type FindingOption } from "@/components/ai/SummaryLab";
import { EmptyState, Forbidden, PageHeader, SimNotice } from "@/components/ui";
import { can } from "@/lib/auth/principal";
import { getDb } from "@/lib/db";
import { getPrincipal } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function SummaryPage({ searchParams }: { searchParams: Promise<{ finding?: string }> }) {
  const me = await getPrincipal("konsol");
  if (!can(me, "ai.view")) return <Forbidden need="ai.view" />;
  const rows = getDb().prepare("SELECT f.id, f.title, f.type, f.proof_status, fa.name AS facility FROM findings f JOIN facilities fa ON fa.id = f.facility_id ORDER BY f.updated_at DESC, f.id DESC LIMIT 60").all() as { id: string; title: string; type: string; proof_status: string; facility: string }[];
  const options: FindingOption[] = rows.map((r) => ({ id: r.id, label: `${r.id} · ${r.type} · ${r.title} · ${r.facility}` }));
  const sp = await searchParams;
  return (
    <>
      <PageHeader eyebrow="Standar dan AI" title="Ringkasan bukti kasus" purpose="Draf ringkasan untuk petugas: fakta dari peserta, dokumen yang mendukung, kontradiksi, informasi yang belum ada, dan saran langkah. Setiap butir menautkan ke sumbernya." />
      <div className="mb-4"><SimNotice>AI hanya menyusun draf. Ringkasan tidak mengubah status pembuktian, tidak menyimpulkan penyebab, dan tidak menyebut fraud, pembayaran, atau sanksi. Petugas yang memutuskan.</SimNotice></div>
      {options.length === 0 ? <EmptyState title="Belum ada temuan" /> : <SummaryLab options={options} initial={sp.finding} />}
    </>
  );
}
