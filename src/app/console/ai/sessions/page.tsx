import Link from "next/link";
import { FilterField } from "@/components/analytics/blocks";
import { InfoDot } from "@/components/explain";
import { AiModeBadge, EmptyState, Forbidden, PageHeader, Pill, SimNotice, TableCard, Toolbar } from "@/components/ui";
import { listSessions } from "@/lib/ai/admin";
import { can } from "@/lib/auth/principal";
import { getDb } from "@/lib/db";
import { SESSION_LABEL, STAGE_SHORT, TONE_CLASS, type SessionStatus, type Stage } from "@/lib/labels";
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
  const filtered = !!(f.status || f.stage || f.ai_mode);
  return (
    <>
      <PageHeader eyebrow="Standar dan AI" title="Riwayat sesi survei" purpose="Telusuri tiap sesi, giliran demi giliran." />
      <Toolbar className="mb-3">
        <form className="contents" role="search" aria-label="Filter sesi">
          <FilterField label="Status" className="w-full sm:w-44">
            <select name="status" defaultValue={f.status ?? ""} className="field"><option value="">Semua</option>{STATUSES.map((s) => <option key={s} value={s}>{SESSION_LABEL[s as SessionStatus] ?? s}</option>)}</select>
          </FilterField>
          <FilterField label="Tahap" className="w-full sm:w-44">
            <select name="stage" defaultValue={f.stage ?? ""} className="field"><option value="">Semua</option>{STAGES.map((s) => <option key={s} value={s}>{STAGE_SHORT[s as Stage] ?? s}</option>)}</select>
          </FilterField>
          <FilterField label="Mode AI terakhir" className="w-full sm:w-48">
            <select name="ai_mode" defaultValue={f.ai_mode ?? ""} className="field"><option value="">Semua</option><option value="simulated">Simulasi</option><option value="live">AI langsung</option><option value="fallback">Fallback</option></select>
          </FilterField>
          <div className="flex w-full gap-2 sm:w-auto">
            <button className="btn btn-primary flex-1 sm:flex-none">Terapkan</button>
            {filtered && <Link href="/console/ai/sessions" className="btn btn-ghost">Atur ulang</Link>}
          </div>
        </form>
      </Toolbar>
      <p className="mb-2 text-caption text-ink-soft">Menampilkan <span className="tabular-nums font-medium text-ink">{rows.length}</span> dari <span className="tabular-nums font-medium text-ink">{total}</span> sesi{filtered ? " yang cocok dengan filter" : ""}.</p>
      <TableCard label="Daftar sesi survei">
        {rows.length === 0 ? <EmptyState title="Tidak ada sesi yang cocok">Ubah atau atur ulang filter untuk melihat sesi lain.</EmptyState> : (
          <table className="table-stack w-full text-left text-body-sm">
            <thead>
              <tr>
                <th className="px-4 py-2.5">Sesi</th>
                <th className="hidden px-4 py-2.5 md:table-cell"><span className="inline-flex items-center gap-1">Peserta <InfoDot k="pseudonim" /></span></th>
                <th className="hidden px-4 py-2.5 sm:table-cell">Tahap</th>
                <th className="hidden px-4 py-2.5 sm:table-cell">Status</th>
                <th className="px-4 py-2.5">Mode AI</th>
                <th className="px-4 py-2.5 text-right">Giliran</th>
                <th className="hidden px-4 py-2.5 text-right sm:table-cell" title="Saran fakta yang ditolak validator">Ditolak validator</th>
                <th className="hidden px-4 py-2.5 text-right sm:table-cell">Koreksi</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="min-w-40 px-4 py-3">
                    <Link href={`/console/ai/sessions/${r.id}`} className="whitespace-nowrap font-mono text-code font-semibold text-brand-ink underline decoration-brand/30 underline-offset-3 hover:decoration-current">{r.id}</Link>
                    <span className="block text-caption text-muted">{r.facility_name}</span>
                  </td>
                  <td data-label="Peserta" className="hidden px-4 py-3 md:table-cell">{r.pseudonym}{r.respondent_role !== "self" && <Pill className={`ml-1.5 ${TONE_CLASS.info}`}>pendamping</Pill>}</td>
                  <td data-label="Tahap" className="hidden px-4 py-3 sm:table-cell">{r.stage_label}{r.uses_draft && <Pill className={`ml-1.5 ${TONE_CLASS.warn}`} title="Memakai butir standar berstatus draft">draft</Pill>}</td>
                  <td data-label="Status" className="hidden px-4 py-3 sm:table-cell">{r.status_label}</td>
                  <td data-label="Mode AI" className="px-4 py-3">{r.ai_mode_last ? <AiModeBadge mode={r.ai_mode_last as "live" | "simulated" | "fallback"} /> : <span className="text-muted">—</span>}</td>
                  <td data-label="Giliran" className="px-4 py-3 text-right tabular-nums">{r.turns}</td>
                  <td data-label="Ditolak validator" className="hidden px-4 py-3 text-right tabular-nums sm:table-cell">{r.rejected}</td>
                  <td data-label="Koreksi" className="hidden px-4 py-3 text-right tabular-nums sm:table-cell">{r.corrections}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableCard>
      <div className="mt-4"><SimNotice>Jawaban mentah hanya tampil di halaman jejak (wewenang ai.view) dan tidak masuk log umum.</SimNotice></div>
    </>
  );
}
