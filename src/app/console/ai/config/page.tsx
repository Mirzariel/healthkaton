import { ActivateButton, ConfigForm, TestConnection, type CfgView } from "@/components/ai/ConfigPanel";
import { Card, CardHeader, DescList, Forbidden, PageHeader, Pill, Section, SectionTitle, SimNotice, StatusPill, TableCard } from "@/components/ui";
import { listConfigs } from "@/lib/ai/admin";
import { can } from "@/lib/auth/principal";
import { getDb } from "@/lib/db";
import { TONE_CLASS } from "@/lib/labels";
import { getPrincipal } from "@/lib/server";

export const dynamic = "force-dynamic";

const MODE_PREF = { auto: "otomatis", simulated: "selalu simulasi", live: "langsung" } as const;

export default async function AiConfigPage() {
  const me = await getPrincipal("konsol");
  if (!can(me, "ai.view")) return <Forbidden need="ai.view" />;
  const c = listConfigs(getDb(), me);
  const active = c.configs.find((x) => x.active) ?? c.configs[0];
  const canEdit = can(me, "ai.config");
  return (
    <>
      <PageHeader eyebrow="Standar dan AI" title="Konfigurasi AI" purpose="Tiap perubahan menjadi versi baru yang dapat ditelusuri." />
      <SimNotice>{c.key_hint} Kunci API hanya dibaca di server, tidak disimpan atau ditampilkan.</SimNotice>

      <Section className="mt-8">
        <SectionTitle title="Konfigurasi aktif" hint={`Versi ${active.version}${active.note ? `. ${active.note}` : ""}`} />
        <Card elevated className="px-5 py-5">
          {canEdit ? <ConfigForm active={active as unknown as CfgView} prompts={c.prompts.map((p) => ({ version: p.version, title: p.title }))} /> : (
            <>
              <DescList items={[
                { k: "Prompt", v: <span className="font-mono text-caption">{active.prompt_version}</span> },
                { k: "Mode", v: MODE_PREF[active.mode_pref] },
                { k: "Model", v: <span className="font-mono text-caption">{active.model}</span> },
                { k: "Anggaran inti / klarifikasi", v: <span className="tabular-nums">{active.budget_core} / {active.budget_clarif}</span> },
              ]} />
              <p className="mt-3 text-caption text-ink-soft">Perubahan konfigurasi membutuhkan wewenang ai.config (admin).</p>
            </>
          )}
        </Card>
        {canEdit && (
          <Card>
            <CardHeader title="Uji koneksi penyedia" hint="Tidak mengubah konfigurasi." />
            <div className="px-5 py-4"><TestConnection /></div>
          </Card>
        )}
      </Section>

      <Section className="mt-10">
        <SectionTitle title="Versi prompt" hint="Versi ketat menolak keluaran di luar skema." />
        <Card className="divide-y divide-line">
          {c.prompts.map((p) => (
            <div key={p.version} className="px-5 py-3.5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5"><strong className="font-mono text-caption">{p.version}</strong><span className="text-body-sm text-ink">{p.title}</span>{p.strict && <StatusPill tone="ok">ketat</StatusPill>}</div>
              <p className="mt-1 text-caption leading-relaxed text-ink-soft">{p.note}</p>
            </div>
          ))}
        </Card>
      </Section>

      <Section className="mt-10">
        <SectionTitle title="Riwayat versi" />
        <TableCard label="Riwayat versi konfigurasi">
          <table className="w-full min-w-[40rem] text-left text-body-sm">
            <thead><tr><th className="px-4 py-2.5">Versi</th><th className="px-4 py-2.5">Prompt</th><th className="px-4 py-2.5">Mode</th><th className="px-4 py-2.5">Model</th><th className="px-4 py-2.5 text-right">Anggaran (inti/klarif.)</th><th className="px-4 py-2.5">Dibuat</th><th className="px-4 py-2.5" /></tr></thead>
            <tbody className="align-top">
              {c.configs.map((x) => (
                <tr key={x.version} className={x.active ? "bg-brand-tint/60" : ""}>
                  <td className="px-4 py-3 font-semibold tabular-nums">{x.version}{x.active ? <Pill className={`ml-2 ${TONE_CLASS.ok}`}>aktif</Pill> : null}</td>
                  <td className="px-4 py-3 font-mono text-code">{x.prompt_version}</td>
                  <td className="px-4 py-3">{MODE_PREF[x.mode_pref]}</td>
                  <td className="px-4 py-3 font-mono text-code">{x.model}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{x.budget_core} / {x.budget_clarif}</td>
                  <td className="px-4 py-3 text-caption text-ink-soft">{x.created_at?.slice(0, 16) ?? "—"}<span className="block">{x.created_by ?? ""}</span>{x.note}</td>
                  <td className="px-4 py-3 text-right">{canEdit && !x.active ? <ActivateButton version={x.version} /> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      </Section>
    </>
  );
}
