import Link from "next/link";
import { CodeTag, InfoDot } from "@/components/explain";
import { Pager, Tag, userName } from "@/components/casework/parts";
import { FilterField, FilterForm, RecordId, rowLink } from "@/components/console/Parts";
import { EmptyState, Forbidden, LinkTabs, PageHeader, ProofBadge, SimNotice, Stat, StatGrid, TableCard } from "@/components/ui";
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

export default async function CasesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const me = await getPrincipal("konsol");
  if (!can(me, "case.view")) return <Forbidden need="case.view" />;
  const db = getDb();
  lapseIfDue(db);
  const sp = await searchParams;
  const tab = one(sp.tab) === "actions" ? "actions" : "proof";
  const params = { tab, q: one(sp.q), source: one(sp.source), stage: one(sp.stage), facility: one(sp.facility), assignee: one(sp.assignee), priority: one(sp.priority), sort: one(sp.sort), status: one(sp.status), overdue: one(sp.overdue) };
  const page = Number(one(sp.page)) || 1;
  /* Prioritas adalah urutan kerja, bukan status: merah hanya untuk keadaan genting, jadi "tinggi" ditampilkan hangat. */
  const prioTone = (p: number) => { const t = PRIORITY_LABEL[p]?.tone ?? "muted"; return t === "danger" ? "warn" : t; };
  const facets = queueFacets(db);
  const names = new Map(facets.assignees.map((a) => [a.id, a.name]));
  const counts = queueCounts(db);
  const proof = tab === "proof" ? proofQueue(db, me, { ...params, page }) : null;
  const acts = tab === "actions" ? actionQueue(db, me, { status: params.status, facility: params.facility, overdue: params.overdue, page }) : null;
  const proofFiltered = !!(params.q || params.source || params.facility || params.assignee || params.priority || params.sort || (params.stage && params.stage !== "active"));
  const actionsFiltered = !!(params.status || params.facility || params.overdue);
  return (
    <>
      <PageHeader title="Antrean kasus" purpose="Temuan yang perlu dibuktikan dan perbaikan yang belum tuntas." eyebrow="Kerja" />
      <StatGrid>
        <Stat label="Temuan aktif" value={counts.active} hint={`${counts.signal} berstatus sinyal`} />
        <Stat label="Menunggu klarifikasi faskes" value={counts.awaiting} tone="warn" hint="Hak jawab faskes berjalan" />
        <Stat label="Usulan menunggu reviewer" value={counts.pendingProposals} hint={`${counts.pendingEscalations} eskalasi menunggu pihak kedua`} />
        <Stat label="Bantahan belum ditanggapi" value={counts.disputes} tone={counts.disputes ? "danger" : "default"} hint="Perlu tanggapan reviewer" />
      </StatGrid>
      <div className="mt-8">
        <LinkTabs label="Antrean" items={[
          { href: "/console/cases?tab=proof", label: "Antrean pembuktian", active: tab === "proof", count: counts.active },
          { href: "/console/cases?tab=actions", label: "Tindakan perbaikan", active: tab === "actions", count: counts.actionsOpen },
        ]} />
      </div>

      {tab === "proof" && proof && (
        <section className="mt-4 space-y-3" aria-label="Antrean pembuktian">
          <FilterForm label="Saring antrean" resetHref={proofFiltered ? "/console/cases?tab=proof" : undefined}>
            <input type="hidden" name="tab" value="proof" />
            <FilterField label="Cari"><input name="q" defaultValue={params.q} placeholder="nomor, judul, faskes" className="field" /></FilterField>
            <FilterField label="Status"><select name="stage" defaultValue={params.stage ?? "active"} className="field">
              <option value="active">Belum final</option><option value="all">Semua</option><option value="final">Sudah final</option>
              {Object.entries(PROOF_LABEL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select></FilterField>
            <FilterField label="Sumber sinyal"><select name="source" defaultValue={params.source ?? ""} className="field">
              <option value="">Semua</option>{facets.sources.map((s) => <option key={s} value={s}>{SOURCE_LABEL[s]?.label ?? s}</option>)}
            </select></FilterField>
            <FilterField label="Faskes"><select name="facility" defaultValue={params.facility ?? ""} className="field">
              <option value="">Semua</option>{facets.facilities.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select></FilterField>
            <FilterField label="Penanggung jawab"><select name="assignee" defaultValue={params.assignee ?? ""} className="field">
              <option value="">Semua</option><option value="none">Belum ditugaskan</option>{facets.assignees.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select></FilterField>
            <FilterField label="Prioritas"><select name="priority" defaultValue={params.priority ?? ""} className="field">
              <option value="">Semua</option>{Object.entries(PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select></FilterField>
            <FilterField label="Urutkan"><select name="sort" defaultValue={params.sort ?? ""} className="field">
              <option value="">Prioritas lalu skor</option><option value="score">Skor sinyal</option><option value="updated">Pembaruan terbaru</option>
            </select></FilterField>
          </FilterForm>
          {proof.rows.length > 0 && (
            <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card shadow-depth-1 md:hidden" aria-label="Antrean pembuktian">
              {proof.rows.map((r) => (
                <li key={r.finding_id} className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CodeTag k="temuan" className="text-muted">{r.finding_id}</CodeTag>
                    <ProofBadge status={r.proof_status} />
                  </div>
                  <Link href={`/console/cases/${r.case_id}#${r.finding_id}`} className={`${rowLink} mt-2 block py-1 text-body-sm leading-snug`}>{r.title}</Link>
                  <p className="mt-1 text-caption text-ink-soft">{r.facility_name.replace(" (simulasi)", "")}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Tag t={prioTone(r.priority)} title={`Skor sinyal ${r.score}`}>Prioritas {PRIORITY_LABEL[r.priority]?.label.toLowerCase() ?? r.priority}</Tag>
                    {r.open_clarifications > 0 && <Tag t="warn">Menunggu faskes</Tag>}
                    {r.open_disputes > 0 && <Tag t="danger">Ada bantahan</Tag>}
                  </div>
                  <dl className="mt-3 grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-3 gap-y-1 text-caption">
                    <dt className="text-muted">Sumber</dt><dd>{SOURCE_LABEL[r.source]?.label ?? r.source}</dd>
                    <dt className="text-muted">Penanggung jawab</dt><dd>{userName(r.assignee_id, names)}</dd>
                    {r.claim_no && <><dt className="text-muted">Klaim</dt><dd className="break-words font-mono text-code">{r.claim_no}</dd></>}
                    <dt className="text-muted">Pembaruan</dt><dd className="tabular-nums">{fmtDate(r.updated_at)}</dd>
                  </dl>
                </li>
              ))}
            </ul>
          )}
          <TableCard label="Antrean pembuktian" className={proof.rows.length > 0 ? "hidden md:block" : ""}>
            {proof.rows.length === 0 ? <EmptyState title="Tidak ada temuan yang cocok">Ubah atau atur ulang saringan di atas.</EmptyState> : (
              <table className="w-full text-left text-body-sm">
                <caption className="sr-only">Antrean pembuktian</caption>
                <thead><tr><th className="px-4 py-2.5"><span className="inline-flex items-center gap-1">Temuan <InfoDot k="temuan" /></span></th><th className="hidden px-4 py-2.5 lg:table-cell">Sumber</th><th className="hidden px-4 py-2.5 md:table-cell">Faskes</th><th className="px-4 py-2.5">Status</th><th className="hidden px-4 py-2.5 sm:table-cell">Prioritas</th><th className="hidden px-4 py-2.5 xl:table-cell">Penanggung jawab</th><th className="hidden px-4 py-2.5 md:table-cell">Pembaruan</th></tr></thead>
                <tbody>
                  {proof.rows.map((r) => (
                    <tr key={r.finding_id} className="align-top">
                      <td className="px-4 py-3">
                        <Link href={`/console/cases/${r.case_id}#${r.finding_id}`} className={`${rowLink} block max-w-[28rem]`}>{r.title}</Link>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-muted">
                          <RecordId>{r.finding_id}</RecordId><span className="hidden sm:inline">{FINDING_LABEL[r.type].short}</span>{r.claim_no && <RecordId>{r.claim_no}</RecordId>}
                          {r.open_clarifications > 0 && <Tag t="warn">Menunggu faskes</Tag>}
                          {r.open_disputes > 0 && <Tag t="danger">Ada bantahan</Tag>}
                        </div>
                        <p className="mt-1 text-caption text-muted md:hidden">{r.facility_name.replace(" (simulasi)", "")} · {fmtDate(r.updated_at)}</p>
                      </td>
                      <td className="hidden px-4 py-3 text-ink-soft lg:table-cell">{SOURCE_LABEL[r.source]?.label ?? r.source}</td>
                      <td className="hidden px-4 py-3 text-ink-soft md:table-cell">{r.facility_name.replace(" (simulasi)", "")}</td>
                      <td className="px-4 py-3"><ProofBadge status={r.proof_status} /><div className="mt-1.5 sm:hidden"><Tag t={prioTone(r.priority)} title={`Skor sinyal ${r.score}`}>{PRIORITY_LABEL[r.priority]?.label ?? r.priority}</Tag></div></td>
                      <td className="hidden px-4 py-3 sm:table-cell"><Tag t={prioTone(r.priority)} title={`Skor sinyal ${r.score}`}>{PRIORITY_LABEL[r.priority]?.label ?? r.priority}</Tag></td>
                      <td className="hidden px-4 py-3 text-ink-soft xl:table-cell">{userName(r.assignee_id, names)}</td>
                      <td className="hidden whitespace-nowrap px-4 py-3 text-ink-soft md:table-cell">{fmtDate(r.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </TableCard>
          <p className="text-caption text-muted"><span className="tabular-nums">{proof.total}</span> temuan. Skor sinyal hanya mengurutkan antrean, bukan menilai faskes.</p>
          <Pager base="/console/cases" page={proof.page} pages={proof.pages} params={params} />
        </section>
      )}

      {tab === "actions" && acts && (
        <section className="mt-4 space-y-3" aria-label="Tindakan perbaikan">
          <FilterForm label="Saring tindakan" resetHref={actionsFiltered ? "/console/cases?tab=actions" : undefined}>
            <input type="hidden" name="tab" value="actions" />
            <FilterField label="Status"><select name="status" defaultValue={params.status ?? "active"} className="field">
              <option value="active">Belum ditutup</option><option value="all">Semua</option>{Object.entries(ACTION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></FilterField>
            <FilterField label="Faskes"><select name="facility" defaultValue={params.facility ?? ""} className="field">
              <option value="">Semua</option>{facets.facilities.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select></FilterField>
            <label className="flex h-9 items-center gap-2 text-body-sm"><input type="checkbox" name="overdue" value="1" defaultChecked={params.overdue === "1"} />Hanya yang lewat target</label>
          </FilterForm>
          <TableCard label="Antrean tindakan perbaikan">
            {acts.rows.length === 0 ? <EmptyState title="Tidak ada tindakan perbaikan yang cocok">Ubah atau atur ulang saringan di atas.</EmptyState> : (
              <table className="w-full text-left text-body-sm">
                <caption className="sr-only">Antrean tindakan perbaikan</caption>
                <thead><tr><th className="px-4 py-2.5">Tindakan</th><th className="hidden px-4 py-2.5 md:table-cell">Faskes</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5">Target</th><th className="hidden px-4 py-2.5 lg:table-cell">Tindak lanjut</th></tr></thead>
                <tbody>
                  {acts.rows.map((a) => (
                    <tr key={a.id} className="align-top">
                      <td className="px-4 py-3">
                        {a.case_id ? <Link href={`/console/cases/${a.case_id}#${a.id}`} className={`${rowLink} block max-w-[28rem]`}>{a.description}</Link> : a.description}
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 text-caption text-muted"><RecordId>{a.id}</RecordId><span>{a.owner ?? "-"}</span>{a.finding_title && <span>{a.finding_title}</span>}</div>
                        <p className="mt-1 text-caption text-muted md:hidden">{a.facility_name.replace(" (simulasi)", "")}</p>
                      </td>
                      <td className="hidden px-4 py-3 text-ink-soft md:table-cell">{a.facility_name.replace(" (simulasi)", "")}</td>
                      <td className="px-4 py-3"><Tag t={a.status === "closed" ? "ok" : a.status === "follow_up_pending" ? "info" : "warn"}>{ACTION_LABEL[a.status as keyof typeof ACTION_LABEL]}</Tag></td>
                      <td className="whitespace-nowrap px-4 py-3"><span className="text-ink-soft">{fmtDate(a.target_date)}</span> {a.overdue && <Tag t="danger">Lewat target</Tag>}</td>
                      <td className="hidden px-4 py-3 text-ink-soft lg:table-cell">{a.pending_followups ? `${a.pending_followups} menunggu` : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </TableCard>
          <Pager base="/console/cases" page={acts.page} pages={acts.pages} params={params} />
        </section>
      )}
      <div className="mt-8">
        <SimNotice>Sinyal belum ditinjau dan bukan putusan. Faskes baru melihat temuan setelah klarifikasi atau tindakan perbaikan dikirim.</SimNotice>
      </div>
    </>
  );
}
