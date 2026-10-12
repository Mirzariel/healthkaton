import { notFound } from "next/navigation";
import { NewDraftBox, QuestionEditor, TransitionBox } from "@/components/RegistryActions";
import { Inset } from "@/components/analytics/blocks";
import { Card, Forbidden, Notice, PageHeader, Pill, SectionTitle, SimNotice, StatusPill } from "@/components/ui";
import { can } from "@/lib/auth/principal";
import { getDb } from "@/lib/db";
import { STAGE_LABEL, TONE_CLASS } from "@/lib/labels";
import { getPrincipal } from "@/lib/server";
import { APPROVAL_DISCLAIMER, getStandardVersion, standardIssues } from "@/lib/standards/registry";
import type { StageKey } from "@/lib/standards/types";

export const dynamic = "force-dynamic";

const NEXT: Record<string, { to: string; label: string; cap: "standards.review" | "standards.approve" }[]> = {
  draft: [{ to: "reviewed", label: "Tandai ditinjau", cap: "standards.review" }],
  reviewed: [{ to: "approved", label: "Setujui (catatan tim)", cap: "standards.approve" }, { to: "draft", label: "Kembalikan ke draft", cap: "standards.review" }],
  approved: [{ to: "retired", label: "Pensiunkan", cap: "standards.approve" }],
  retired: [],
};
const STATUS_TONE: Record<string, keyof typeof TONE_CLASS> = { draft: "muted", reviewed: "info", approved: "ok", retired: "muted" };

export default async function StandardDetail({ params }: { params: Promise<{ id: string }> }) {
  const me = await getPrincipal("konsol");
  if (!can(me, "standards.view")) return <Forbidden need="standards.view" />;
  const id = decodeURIComponent((await params).id);
  const db = getDb();
  const d = getStandardVersion(db, id);
  if (!d) notFound();
  const issues = standardIssues(db, id);
  const editable = d.version.status === "draft" && can(me, "standards.edit");
  const options = (NEXT[d.version.status] ?? []).filter((o) => can(me, o.cap));
  const stages = [...new Set(d.indicators.map((i) => i.stage))] as StageKey[];
  const errors = issues.filter((x) => x.level === "error").length;
  return (
    <>
      <PageHeader
        title={`${d.version.standard_name} · ${d.version.version}`}
        purpose={`Status ${d.version.status}. ${d.indicators.length} butir, ${d.questions.length} pertanyaan.`}
        crumbs={[{ label: "Registry standar", href: "/console/standards" }, { label: d.version.id }]}
      >
        <StatusPill tone={STATUS_TONE[d.version.status] ?? "muted"}>{d.version.status}</StatusPill>
      </PageHeader>
      <SimNotice>{APPROVAL_DISCLAIMER}</SimNotice>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="min-w-0 space-y-9">
          {stages.map((st) => (
            <section key={st} className="space-y-3" aria-labelledby={`st-${st}`}>
              <h2 id={`st-${st}`} className="text-[15px] font-semibold tracking-tight text-ink">{STAGE_LABEL[st] ?? st}</h2>
              {d.indicators.filter((i) => i.stage === st).map((i) => (
                <Card key={i.id}>
                  <div className="px-5 py-4">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="mr-1 font-mono text-[12px] text-muted">{i.indicator_id}</span>
                      <Pill className={TONE_CLASS.muted}>{i.kind}</Pill>
                      {i.source_id ? <Pill className={TONE_CLASS.info} title={i.locator ?? undefined}>Sumber {i.source_id}</Pill> : <Pill className={TONE_CLASS.warn}>Tanpa sumber</Pill>}
                      {i.scope.length > 0 && <Pill className={TONE_CLASS.muted}>{i.scope.join(", ")}</Pill>}
                    </div>
                    <h3 className="mt-2.5 text-[15px] font-semibold text-ink">{i.title}</h3>
                    {i.locator && <p className="mt-1 text-[12.5px] leading-relaxed text-muted">Lokator: {i.locator}</p>}
                  </div>
                  <ul className="divide-y divide-line border-t border-line">
                    {d.questions.filter((q) => q.indicator_version_id === i.id).map((q) => (
                      <li key={q.id} className="bg-subtle/40 px-5 py-3 text-[14px] leading-relaxed">
                        <span className="mb-0.5 block font-mono text-[11.5px] text-muted">{q.target_slot}{q.is_core ? "" : " · tambahan"}</span>
                        <QuestionEditor id={q.id} text={q.text} editable={editable} />
                      </li>
                    ))}
                  </ul>
                </Card>
              ))}
            </section>
          ))}
        </div>

        <aside className="min-w-0 space-y-6 lg:sticky lg:top-20 lg:self-start">
          <section className="space-y-2.5">
            <SectionTitle title="Status" />
            <Inset className="p-4"><TransitionBox id={id} options={options} /></Inset>
          </section>
          <section className="space-y-2.5">
            <SectionTitle title="Validasi" />
            {issues.length === 0 ? <Notice tone="ok">Tidak ada galat atau peringatan.</Notice> : (
              <Inset>
                <p className="border-b border-line px-4 py-2.5 text-[12.5px] text-muted"><span className="tabular-nums">{errors}</span> galat, <span className="tabular-nums">{issues.length - errors}</span> peringatan</p>
                <ul className="divide-y divide-line">
                  {issues.slice(0, 20).map((x, k) => <li key={k} className={`px-4 py-2.5 text-[13px] leading-relaxed ${x.level === "error" ? "text-danger" : "text-warn"}`}><span className="font-mono text-[11.5px]">{x.where}</span>: {x.message}</li>)}
                </ul>
              </Inset>
            )}
          </section>
          {can(me, "standards.edit") && (
            <section className="space-y-2.5">
              <SectionTitle title="Versi baru" hint="Versi lama tidak berubah." />
              <Inset className="p-4"><NewDraftBox id={id} /></Inset>
            </section>
          )}
          <section className="space-y-2.5">
            <SectionTitle title="Riwayat" />
            <Inset className="divide-y divide-line text-[13.5px]">
              {d.history.length === 0 && <p className="px-4 py-3 text-ink-soft">Belum ada riwayat.</p>}
              {d.history.map((h, k) => (
                <div key={k} className="px-4 py-3">
                  <p className="font-medium text-ink">{String(h.from_status ?? "-")} ke {String(h.to_status)}</p>
                  <p className="text-[12px] text-muted">{String(h.actor)} · {String(h.at)}</p>
                  {h.note ? <p className="mt-1 leading-relaxed text-ink-soft">{String(h.note)}</p> : null}
                </div>
              ))}
            </Inset>
          </section>
        </aside>
      </div>
    </>
  );
}
