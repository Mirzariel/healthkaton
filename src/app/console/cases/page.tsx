import Link from "next/link";
import { Pager, Tag, userName } from "@/components/casework/parts";
import { Card, EmptyState, Forbidden, PageHeader, ProofBadge, SectionTitle, SimNotice, Stat } from "@/components/ui";
import { can } from "@/lib/auth/principal";
import { FINDING_LABEL, PROOF_LABEL, ACTION_LABEL } from "@/lib/labels";
import { SOURCE_LABEL, PRIORITY_LABEL } from "@/lib/casework/labels";
import { actionQueue, proofQueue, queueCounts, queueFacets } from "@/lib/casework/queries";
import { lapseIfDue } from "@/lib/casework/workflow";
import { fmtDate } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { getPrincipal } from "@/lib/server";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
const sel = "rounded-lg border border-line bg-card px-2 py-1.5 text-sm";

export default async function CasesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const me = await getPrincipal("konsol");
  if (!can(me, "case.view")) return <Forbidden need="case.view" />;
  const db = getDb();
  lapseIfDue(db);
  const sp = await searchParams;
  const tab = one(sp.tab) === "actions" ? "actions" : "proof";
  const params = { tab, q: one(sp.q), source: one(sp.source), stage: one(sp.stage), facility: one(sp.facility), assignee: one(sp.assignee), priority: one(sp.priority), sort: one(sp.sort), status: one(sp.status), overdue: one(sp.overdue) };
  const page = Number(one(sp.page)) || 1;
  const facets = queueFacets(db);
  const names = new Map(facets.assignees.map((a) => [a.id, a.name]));
  const counts = queueCounts(db);
  const proof = tab === "proof" ? proofQueue(db, me, { ...params, page }) : null;
  const acts = tab === "actions" ? actionQueue(db, me, { status: params.status, facility: params.facility, overdue: params.overdue, page }) : null;
  const tabLink = (t: string, label: string, n: number) => (
    <Link href={`/console/cases?tab=${t}`} aria-current={tab === t ? "page" : undefined} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${tab === t ? "bg-brand text-white" : "border border-line bg-card hover:border-ink/40"}`}>
      {label} <span className="tabular-nums opacity-80">({n})</span>
    </Link>
  );
  return (
    <>
      <PageHeader title="Antrean kasus" purpose="Dua antrean yang dipisah: temuan yang masih perlu dibuktikan, dan tindakan perbaikan yang belum tuntas. Urutan memakai prioritas dan skor sinyal; skor hanya mengurutkan, bukan menilai faskes." eyebrow="Kerja" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Temuan aktif" value={counts.active} hint={`${counts.signal} masih berstatus sinyal`} />
        <Stat label="Menunggu klarifikasi faskes" value={counts.awaiting} tone="warn" hint="Hak jawab faskes berjalan" />
        <Stat label="Usulan menunggu reviewer" value={counts.pendingProposals} hint={`${counts.pendingEscalations} permintaan eskalasi menunggu pihak kedua`} />
        <Stat label="Bantahan faskes belum ditanggapi" value={counts.disputes} tone={counts.disputes ? "danger" : "default"} />
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        {tabLink("proof", "Antrean pembuktian", counts.active)}
        {tabLink("actions", "Tindakan perbaikan", counts.actionsOpen)}
      </div>

      {tab === "proof" && proof && (
        <section className="mt-4 space-y-3">
          <form method="get" className="flex flex-wrap items-end gap-2" aria-label="Saring antrean">
            <input type="hidden" name="tab" value="proof" />
            <label className="text-xs text-ink-soft">Cari<input name="q" defaultValue={params.q} placeholder="nomor, judul, faskes" className={`${sel} mt-0.5 block`} /></label>
            <label className="text-xs text-ink-soft">Status<select name="stage" defaultValue={params.stage ?? "active"} className={`${sel} mt-0.5 block`}>
              <option value="active">Belum final</option><option value="all">Semua</option><option value="final">Sudah final</option>
              {Object.entries(PROOF_LABEL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select></label>
            <label className="text-xs text-ink-soft">Sumber sinyal<select name="source" defaultValue={params.source ?? ""} className={`${sel} mt-0.5 block`}>
              <option value="">Semua</option>{facets.sources.map((s) => <option key={s} value={s}>{SOURCE_LABEL[s]?.label ?? s}</option>)}
            </select></label>
            <label className="text-xs text-ink-soft">Faskes<select name="facility" defaultValue={params.facility ?? ""} className={`${sel} mt-0.5 block`}>
              <option value="">Semua</option>{facets.facilities.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select></label>
            <label className="text-xs text-ink-soft">Penanggung jawab<select name="assignee" defaultValue={params.assignee ?? ""} className={`${sel} mt-0.5 block`}>
              <option value="">Semua</option><option value="none">Belum ditugaskan</option>{facets.assignees.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select></label>
            <label className="text-xs text-ink-soft">Prioritas<select name="priority" defaultValue={params.priority ?? ""} className={`${sel} mt-0.5 block`}>
              <option value="">Semua</option>{Object.entries(PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select></label>
            <label className="text-xs text-ink-soft">Urutkan<select name="sort" defaultValue={params.sort ?? ""} className={`${sel} mt-0.5 block`}>
              <option value="">Prioritas lalu skor</option><option value="score">Skor sinyal</option><option value="updated">Pembaruan terbaru</option>
            </select></label>
            <button className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white">Terapkan</button>
          </form>
          <Card className="overflow-x-auto">
            {proof.rows.length === 0 ? <EmptyState title="Tidak ada temuan yang cocok" >Ubah saringan di atas.</EmptyState> : (
              <table className="w-full min-w-[56rem] text-left text-sm">
                <caption className="sr-only">Antrean pembuktian</caption>
                <thead className="text-xs text-muted"><tr><th className="p-3">Temuan</th><th className="p-3">Sumber</th><th className="p-3">Faskes</th><th className="p-3">Status</th><th className="p-3">Prioritas</th><th className="p-3">Penanggung jawab</th><th className="p-3">Pembaruan</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {proof.rows.map((r) => (
                    <tr key={r.finding_id} className="align-top">
                      <td className="p-3">
                        <Link href={`/console/cases/${r.case_id}#${r.finding_id}`} className="font-semibold underline-offset-4 hover:underline">{r.title}</Link>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                          <span className="font-mono">{r.finding_id}</span><span>·</span><span>{FINDING_LABEL[r.type].short}</span>{r.claim_no && <><span>·</span><span className="font-mono">{r.claim_no}</span></>}
                          {r.open_clarifications > 0 && <Tag t="warn">Menunggu faskes</Tag>}
                          {r.open_disputes > 0 && <Tag t="danger">Ada bantahan</Tag>}
                        </div>
                      </td>
                      <td className="p-3 text-ink-soft">{SOURCE_LABEL[r.source]?.label ?? r.source}</td>
                      <td className="p-3 text-ink-soft">{r.facility_name.replace(" (simulasi)", "")}</td>
                      <td className="p-3"><ProofBadge status={r.proof_status} /></td>
                      <td className="p-3"><Tag t={PRIORITY_LABEL[r.priority]?.tone ?? "muted"} title={`Skor sinyal ${r.score}`}>{PRIORITY_LABEL[r.priority]?.label ?? r.priority}</Tag></td>
                      <td className="p-3 text-ink-soft">{userName(r.assignee_id, names)}</td>
                      <td className="p-3 text-ink-soft whitespace-nowrap">{fmtDate(r.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
          <p className="text-xs text-muted">{proof.total} temuan. Skor sinyal hanya menentukan urutan antrean dan tidak menggambarkan mutu faskes.</p>
          <Pager base="/console/cases" page={proof.page} pages={proof.pages} params={params} />
        </section>
      )}

      {tab === "actions" && acts && (
        <section className="mt-4 space-y-3">
          <form method="get" className="flex flex-wrap items-end gap-2" aria-label="Saring tindakan">
            <input type="hidden" name="tab" value="actions" />
            <label className="text-xs text-ink-soft">Status<select name="status" defaultValue={params.status ?? "active"} className={`${sel} mt-0.5 block`}>
              <option value="active">Belum ditutup</option><option value="all">Semua</option>{Object.entries(ACTION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></label>
            <label className="text-xs text-ink-soft">Faskes<select name="facility" defaultValue={params.facility ?? ""} className={`${sel} mt-0.5 block`}>
              <option value="">Semua</option>{facets.facilities.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select></label>
            <label className="flex items-center gap-1.5 pb-1.5 text-sm"><input type="checkbox" name="overdue" value="1" defaultChecked={params.overdue === "1"} />Hanya yang lewat target</label>
            <button className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white">Terapkan</button>
          </form>
          <Card className="overflow-x-auto">
            {acts.rows.length === 0 ? <EmptyState title="Tidak ada tindakan perbaikan yang cocok" /> : (
              <table className="w-full min-w-[48rem] text-left text-sm">
                <caption className="sr-only">Antrean tindakan perbaikan</caption>
                <thead className="text-xs text-muted"><tr><th className="p-3">Tindakan</th><th className="p-3">Faskes</th><th className="p-3">Status</th><th className="p-3">Target</th><th className="p-3">Tindak lanjut</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {acts.rows.map((a) => (
                    <tr key={a.id} className="align-top">
                      <td className="p-3">
                        {a.case_id ? <Link href={`/console/cases/${a.case_id}#${a.id}`} className="font-semibold underline-offset-4 hover:underline">{a.description}</Link> : a.description}
                        <div className="mt-0.5 text-xs text-muted"><span className="font-mono">{a.id}</span> · {a.owner ?? "-"}{a.finding_title && <> · {a.finding_title}</>}</div>
                      </td>
                      <td className="p-3 text-ink-soft">{a.facility_name.replace(" (simulasi)", "")}</td>
                      <td className="p-3"><Tag t={a.status === "closed" ? "ok" : a.status === "follow_up_pending" ? "info" : "warn"}>{ACTION_LABEL[a.status as keyof typeof ACTION_LABEL]}</Tag></td>
                      <td className="p-3 whitespace-nowrap">{fmtDate(a.target_date)} {a.overdue && <Tag t="danger">Lewat target</Tag>}</td>
                      <td className="p-3 text-ink-soft">{a.pending_followups ? `${a.pending_followups} menunggu` : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
          <Pager base="/console/cases" page={acts.page} pages={acts.pages} params={params} />
        </section>
      )}
      <section className="mt-8 space-y-3">
        <SectionTitle title="Cara membaca antrean" />
        <SimNotice>Temuan berstatus sinyal belum ditinjau dan bukan putusan. Faskes baru melihat suatu temuan setelah petugas mengirim klarifikasi atau menyusun tindakan perbaikan.</SimNotice>
      </section>
    </>
  );
}
