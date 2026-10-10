import { ActivateButton, ConfigForm, TestConnection, type CfgView } from "@/components/ai/ConfigPanel";
import { Card, Forbidden, PageHeader, Pill, SectionTitle, SimNotice } from "@/components/ui";
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
      <PageHeader eyebrow="Standar dan AI" title="Konfigurasi AI" purpose="Setiap perubahan membuat versi baru yang dapat ditelusuri. Anggaran pertanyaan ditegakkan oleh aturan, bukan oleh model." />
      <SimNotice>{c.key_hint} Kunci penyedia tidak pernah disimpan di basis data atau ditampilkan di sini; ia dibaca dari variabel lingkungan server (ANTHROPIC_API_KEY).</SimNotice>
      <section className="mt-6 space-y-3">
        <SectionTitle title="Konfigurasi aktif" hint={`Versi ${active.version}${active.note ? ` · ${active.note}` : ""}`} />
        <Card className="p-4">
          {canEdit ? <ConfigForm active={active as unknown as CfgView} prompts={c.prompts.map((p) => ({ version: p.version, title: p.title }))} /> : (
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div><dt className="text-xs text-muted">Prompt</dt><dd>{active.prompt_version}</dd></div>
              <div><dt className="text-xs text-muted">Mode</dt><dd>{MODE_PREF[active.mode_pref]}</dd></div>
              <div><dt className="text-xs text-muted">Model</dt><dd>{active.model}</dd></div>
              <div><dt className="text-xs text-muted">Anggaran inti / klarifikasi</dt><dd>{active.budget_core} / {active.budget_clarif}</dd></div>
              <p className="text-xs text-ink-soft sm:col-span-2">Perubahan konfigurasi membutuhkan wewenang ai.config (admin).</p>
            </dl>
          )}
        </Card>
        {canEdit && <Card className="p-4"><p className="mb-2 text-sm font-semibold">Uji koneksi penyedia</p><TestConnection /></Card>}
      </section>
      <section className="mt-8 space-y-3">
        <SectionTitle title="Versi prompt" hint="Daftar prompt yang tersedia; versi 'strict' menolak keluaran di luar skema." />
        <Card className="divide-y divide-line">
          {c.prompts.map((p) => (
            <div key={p.version} className="p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2"><strong className="font-mono">{p.version}</strong><span>{p.title}</span>{p.strict && <Pill className={TONE_CLASS.ok}>ketat</Pill>}</div>
              <p className="mt-1 text-xs text-ink-soft">{p.note}</p>
            </div>
          ))}
        </Card>
      </section>
      <section className="mt-8 space-y-3">
        <SectionTitle title="Riwayat versi" />
        <Card className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted"><tr><th className="p-3">Versi</th><th className="p-3">Prompt</th><th className="p-3">Mode</th><th className="p-3">Model</th><th className="p-3">Anggaran (inti/klarif.)</th><th className="p-3">Dibuat</th><th className="p-3" /></tr></thead>
            <tbody className="divide-y divide-line">
              {c.configs.map((x) => (
                <tr key={x.version}>
                  <td className="p-3 font-semibold tabular-nums">{x.version}{x.active ? <Pill className={`ml-2 ${TONE_CLASS.ok}`}>aktif</Pill> : null}</td>
                  <td className="p-3 font-mono text-xs">{x.prompt_version}</td>
                  <td className="p-3">{MODE_PREF[x.mode_pref]}</td>
                  <td className="p-3 font-mono text-xs">{x.model}</td>
                  <td className="p-3 tabular-nums">{x.budget_core} / {x.budget_clarif}</td>
                  <td className="p-3 text-xs text-ink-soft">{x.created_at?.slice(0, 16) ?? "—"}<span className="block">{x.created_by ?? ""}</span>{x.note}</td>
                  <td className="p-3 text-right">{canEdit && !x.active ? <ActivateButton version={x.version} /> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>
    </>
  );
}
