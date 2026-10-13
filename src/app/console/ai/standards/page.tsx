import Link from "next/link";
import { Card, Forbidden, PageHeader, Pill, Section, SectionTitle, SimNotice, Stat, StatGrid } from "@/components/ui";
import { IconChevronDown } from "@/components/icons";
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
      <PageHeader eyebrow="Standar dan AI" title="Sumber standar yang dipakai survei" purpose="AI hanya memakai butir dari bank standar yang ditinjau." />
      <StatGrid>
        <Stat label="Butir dalam bank" value={s.indicators.length} hint={`${draftCount} berstatus draft`} tone={draftCount ? "warn" : "ok"} />
        <Stat label="Sesi memakai butir draft" value={s.sessions_with_draft} hint={`dari ${s.sessions_total} sesi`} tone={s.sessions_with_draft ? "warn" : "default"} />
        <Stat label="Versi standar" value={s.versions.length} />
      </StatGrid>
      <div className="mt-4"><SimNotice>{s.note}</SimNotice></div>
      <Section className="mt-8">
        <SectionTitle title="Butir dan pertanyaan" hint="Hanya baca; ubah di Registry standar.">
          <Link href="/console/standards" className="btn btn-secondary btn-sm">Buka registry</Link>
        </SectionTitle>
        <Card className="divide-y divide-line">
          {s.indicators.map((i) => (
            <details key={i.id} className="group">
              <summary className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 hover:bg-subtle/60 sm:px-5">
                <span className="min-w-0 flex-1 basis-56 text-body-sm font-semibold text-ink">{i.title}</span>
                <span className="flex flex-wrap items-center gap-1.5">
                  <Pill className={TONE_CLASS.muted}>{STAGE_LABEL[i.stage as Stage]}</Pill>
                  <Pill className={i.status === "draft" ? TONE_CLASS.warn : TONE_CLASS.ok} title="Status versi standar">{i.status}</Pill>
                  {!i.observable_by_patient && <Pill className={TONE_CLASS.info}>tidak teramati peserta</Pill>}
                </span>
                <span className="flex items-center gap-2 text-caption tabular-nums text-muted">
                  {i.sessions_using} sesi
                  <IconChevronDown size={16} className="transition-transform duration-150 group-open:rotate-180" />
                </span>
              </summary>
              <div className="space-y-3 border-t border-line bg-subtle/40 px-4 py-4 sm:px-5">
                <p className="text-caption leading-relaxed text-ink-soft"><span className="font-mono text-code text-ink">{i.indicator_id}</span>, versi {i.standard_version}{i.locator ? `. ${i.locator}` : ""}</p>
                <p className="text-caption leading-relaxed">
                  {i.source ? <><span className="text-muted">Sumber:</span> {i.source.title} <Pill className={`ml-1 ${i.source.validation_status === "validated" ? TONE_CLASS.ok : TONE_CLASS.warn}`}>{i.source.validation_status}</Pill>{i.source.validation_owner ? <span className="text-ink-soft"> pemilik validasi: {i.source.validation_owner}</span> : null}</> : <span className="text-warn">Sumber belum ditautkan.</span>}
                </p>
                <ul className="space-y-2 border-t border-line pt-3">
                  {i.questions.map((q) => (
                    <li key={q.id} className="text-body-sm leading-relaxed">
                      <span className="mr-2 font-mono text-code text-muted">{q.id}</span>{q.text}
                      <span className="mt-0.5 block text-caption text-muted">mengisi slot <span className="font-mono">{q.target_slot}</span>{q.core ? ", pertanyaan inti" : ""}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </details>
          ))}
        </Card>
      </Section>
    </>
  );
}
