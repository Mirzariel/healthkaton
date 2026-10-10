import Link from "next/link";
import { Card, Forbidden, PageHeader, Pill, SectionTitle, SimNotice, Stat } from "@/components/ui";
import { standardsSource } from "@/lib/ai/admin";
import { can } from "@/lib/auth/principal";
import { getDb } from "@/lib/db";
import { STAGE_LABEL, TONE_CLASS, type Stage } from "@/lib/labels";
import { getPrincipal } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function AiStandardsPage() {
  const me = await getPrincipal("konsol");
  if (!can(me, "ai.view")) return <Forbidden need="ai.view" />;
  const s = standardsSource(getDb(), me);
  const draftCount = s.indicators.filter((i) => i.status === "draft").length;
  return (
    <>
      <PageHeader eyebrow="Standar dan AI" title="Sumber standar yang dipakai survei" purpose="Pertanyaan dan butir yang boleh disentuh AI berasal dari bank standar yang ditinjau, bukan dari model. Halaman ini menunjukkan butir, versi, lokator sumber, dan statusnya." />
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Butir dalam bank" value={s.indicators.length} hint={`${draftCount} berstatus draft`} tone={draftCount ? "warn" : "ok"} />
        <Stat label="Sesi memakai butir draft" value={s.sessions_with_draft} hint={`dari ${s.sessions_total} sesi`} tone={s.sessions_with_draft ? "warn" : "default"} />
        <Stat label="Versi standar" value={s.versions.length} />
      </div>
      <div className="mt-4"><SimNotice>{s.note}</SimNotice></div>
      <section className="mt-8 space-y-3">
        <SectionTitle title="Butir dan pertanyaan" hint="Butir diubah dan ditinjau di Registry standar; halaman ini hanya membaca." />
        <div className="space-y-3">
          {s.indicators.map((i) => (
            <Card key={i.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <strong className="text-sm">{i.title}</strong>
                <Pill className={TONE_CLASS.muted}>{STAGE_LABEL[i.stage as Stage]}</Pill>
                <Pill className={i.status === "draft" ? TONE_CLASS.warn : TONE_CLASS.ok} title="Status versi standar">{i.status}</Pill>
                {!i.observable_by_patient && <Pill className={TONE_CLASS.info}>tidak teramati peserta</Pill>}
                <span className="ml-auto text-xs text-ink-soft">{i.sessions_using} sesi</span>
              </div>
              <p className="mt-1 text-xs text-ink-soft"><span className="font-mono">{i.indicator_id}</span> · {i.standard_version}{i.locator ? ` · ${i.locator}` : ""}</p>
              <p className="mt-1 text-xs">
                {i.source ? <>Sumber: {i.source.title} <Pill className={i.source.validation_status === "validated" ? TONE_CLASS.ok : TONE_CLASS.warn}>{i.source.validation_status}</Pill>{i.source.validation_owner ? <span className="text-ink-soft"> · pemilik validasi: {i.source.validation_owner}</span> : null}</> : <span className="text-warn">Sumber belum ditautkan.</span>}
              </p>
              <ul className="mt-2 space-y-1 border-t border-line pt-2 text-xs">
                {i.questions.map((q) => <li key={q.id}><span className="font-mono text-muted">{q.id}</span> {q.text} <span className="text-muted">→ {q.target_slot}{q.core ? " · inti" : ""}</span></li>)}
              </ul>
            </Card>
          ))}
        </div>
        <p className="text-sm"><Link href="/console/standards" className="font-semibold text-brand underline underline-offset-4">Buka Registry standar →</Link></p>
      </section>
    </>
  );
}
