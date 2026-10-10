import { notFound } from "next/navigation";
import { NewDraftBox, QuestionEditor, TransitionBox } from "@/components/RegistryActions";
import { Card, Forbidden, PageHeader, Pill, SectionTitle, SimNotice } from "@/components/ui";
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
  return (
    <>
      <PageHeader
        title={`${d.version.standard_name} · ${d.version.version}`}
        purpose={`Status ${d.version.status}. ${d.indicators.length} butir, ${d.questions.length} pertanyaan.`}
        crumbs={[{ label: "Registry standar", href: "/console/standards" }, { label: d.version.id }]}
      />
      <SimNotice>{APPROVAL_DISCLAIMER}</SimNotice>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          {stages.map((st) => (
            <section key={st} className="space-y-3">
              <SectionTitle title={STAGE_LABEL[st] ?? st} />
              {d.indicators.filter((i) => i.stage === st).map((i) => (
                <Card key={i.id} className="p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-muted">{i.indicator_id}</span>
                    <Pill className={TONE_CLASS.muted}>{i.kind}</Pill>
                    {i.source_id ? <Pill className={TONE_CLASS.info} title={i.locator ?? undefined}>Sumber {i.source_id}</Pill> : <Pill className={TONE_CLASS.warn}>Tanpa sumber</Pill>}
                    <Pill className={TONE_CLASS.muted}>{i.scope.join(", ")}</Pill>
                  </div>
                  <h3 className="mt-2 font-semibold">{i.title}</h3>
                  {i.locator && <p className="mt-0.5 text-xs text-muted">Lokator: {i.locator}</p>}
                  <ul className="mt-3 space-y-2 text-sm">
                    {d.questions.filter((q) => q.indicator_version_id === i.id).map((q) => (
                      <li key={q.id} className="rounded-lg bg-brand-soft/40 px-3 py-2">
                        <span className="font-mono text-[11px] text-muted">{q.target_slot}{q.is_core ? "" : " · tambahan"}</span>
                        <div><QuestionEditor id={q.id} text={q.text} editable={editable} /></div>
                      </li>
                    ))}
                  </ul>
                </Card>
              ))}
            </section>
          ))}
        </div>
        <aside className="space-y-6">
          <section className="space-y-2">
            <SectionTitle title="Validasi" />
            <Card className="p-4 text-sm">
              {issues.length === 0 ? <p className="text-ok">Tidak ada galat atau peringatan.</p> : (
                <ul className="space-y-1.5">
                  {issues.slice(0, 20).map((x, k) => <li key={k} className={x.level === "error" ? "text-danger" : "text-warn"}><span className="font-mono text-xs">{x.where}</span>: {x.message}</li>)}
                </ul>
              )}
            </Card>
          </section>
          <section className="space-y-2">
            <SectionTitle title="Status" />
            <Card className="p-4"><TransitionBox id={id} options={options} /></Card>
          </section>
          {can(me, "standards.edit") && (
            <section className="space-y-2">
              <SectionTitle title="Versi baru" hint="Versi lama tidak berubah." />
              <Card className="p-4"><NewDraftBox id={id} /></Card>
            </section>
          )}
          <section className="space-y-2">
            <SectionTitle title="Riwayat" />
            <Card className="divide-y divide-line text-sm">
              {d.history.length === 0 && <p className="p-4 text-ink-soft">Belum ada riwayat.</p>}
              {d.history.map((h, k) => (
                <div key={k} className="p-3">
                  <p className="font-medium">{String(h.from_status ?? "-")} → {String(h.to_status)}</p>
                  <p className="text-xs text-muted">{String(h.actor)} · {String(h.at)}</p>
                  {h.note ? <p className="mt-1 text-ink-soft">{String(h.note)}</p> : null}
                </div>
              ))}
            </Card>
          </section>
        </aside>
      </div>
    </>
  );
}
