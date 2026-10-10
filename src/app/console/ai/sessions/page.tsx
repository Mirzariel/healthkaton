import Link from "next/link";
import { AiModeBadge, Card, EmptyState, Forbidden, PageHeader, Pill, SimNotice } from "@/components/ui";
import { listSessions } from "@/lib/ai/admin";
import { can } from "@/lib/auth/principal";
import { getDb } from "@/lib/db";
import { TONE_CLASS } from "@/lib/labels";
import { getPrincipal } from "@/lib/server";

export const dynamic = "force-dynamic";

const STATUSES = ["active", "completed", "partial", "expired", "cancelled", "scheduled"];
const STAGES = ["pre", "intra", "post", "directed"];

export default async function SessionsPage({ searchParams }: { searchParams: Promise<{ status?: string; stage?: string; ai_mode?: string }> }) {
  const me = await getPrincipal("konsol");
  if (!can(me, "ai.view")) return <Forbidden need="ai.view" />;
  const sp = await searchParams;
  const f = { status: STATUSES.includes(sp.status ?? "") ? sp.status : undefined, stage: STAGES.includes(sp.stage ?? "") ? sp.stage : undefined, ai_mode: ["live", "simulated", "fallback"].includes(sp.ai_mode ?? "") ? sp.ai_mode : undefined };
  const { rows, total } = listSessions(getDb(), me, { ...f, limit: 100 });
  const sel = "rounded-lg border border-line bg-card px-3 py-2 text-sm";
  return (
    <>
      <PageHeader eyebrow="Standar dan AI" title="Riwayat sesi survei" purpose="Setiap sesi dapat ditelusuri per giliran: pertanyaan, jawaban, saran AI, hasil validator, dan konfirmasi peserta. Peserta ditampilkan sebagai pseudonim." />
      <form className="mb-4 flex flex-wrap items-end gap-2" role="search">
        <label className="text-xs text-ink-soft">Status<select name="status" defaultValue={f.status ?? ""} className={`${sel} mt-1 block`}><option value="">Semua</option>{STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
        <label className="text-xs text-ink-soft">Tahap<select name="stage" defaultValue={f.stage ?? ""} className={`${sel} mt-1 block`}><option value="">Semua</option>{STAGES.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
        <label className="text-xs text-ink-soft">Mode AI terakhir<select name="ai_mode" defaultValue={f.ai_mode ?? ""} className={`${sel} mt-1 block`}><option value="">Semua</option><option value="simulated">Simulasi</option><option value="live">AI langsung</option><option value="fallback">Fallback</option></select></label>
        <button className="rounded-lg border border-line bg-card px-3 py-2 text-sm font-semibold">Terapkan</button>
      </form>
      <p className="mb-2 text-sm text-ink-soft">Menampilkan {rows.length} dari {total} sesi.</p>
      <Card className="overflow-x-auto">
        {rows.length === 0 ? <EmptyState title="Tidak ada sesi yang cocok" /> : (
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted"><tr><th className="p-3">Sesi</th><th className="p-3">Peserta</th><th className="p-3">Tahap</th><th className="p-3">Status</th><th className="p-3">Mode AI</th><th className="p-3 text-right">Giliran</th><th className="p-3 text-right">Ditolak validator</th><th className="p-3 text-right">Koreksi</th></tr></thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="p-3"><Link href={`/console/ai/sessions/${r.id}`} className="font-mono text-xs font-semibold text-brand underline underline-offset-2">{r.id}</Link><span className="block text-xs text-muted">{r.facility_name}</span></td>
                  <td className="p-3">{r.pseudonym}{r.respondent_role !== "self" && <Pill className={`ml-1 ${TONE_CLASS.info}`}>pendamping</Pill>}</td>
                  <td className="p-3">{r.stage_label}{r.uses_draft && <Pill className={`ml-1 ${TONE_CLASS.warn}`} title="Memakai butir standar berstatus draft">draft</Pill>}</td>
                  <td className="p-3">{r.status_label}</td>
                  <td className="p-3">{r.ai_mode_last ? <AiModeBadge mode={r.ai_mode_last as "live" | "simulated" | "fallback"} /> : <span className="text-muted">—</span>}</td>
                  <td className="p-3 text-right tabular-nums">{r.turns}</td>
                  <td className="p-3 text-right tabular-nums">{r.rejected}</td>
                  <td className="p-3 text-right tabular-nums">{r.corrections}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <div className="mt-4"><SimNotice>Jawaban mentah peserta hanya tampil pada halaman jejak untuk peran dengan wewenang ai.view dan tidak ditulis ke log umum.</SimNotice></div>
    </>
  );
}
