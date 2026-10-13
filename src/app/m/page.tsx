import type { Metadata } from "next";
import Link from "next/link";
import { Brand } from "@/components/Brand";
import { IconArrowUpRight } from "@/components/icons";
import { ParticipantApp } from "@/components/m/ParticipantApp";
import { PersonaSwitcher, type PersonaOption } from "@/components/Shell";
import { Pill } from "@/components/ui";
import { ROLE_HINT, ROLE_LABEL } from "@/lib/auth/principal";
import { liveAvailable } from "@/lib/ai/invocations";
import { getDb } from "@/lib/db";
import { demoRolesEnabled, getPrincipal, listPersonas } from "@/lib/server";
import { getHome } from "@/lib/survey/participant";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Aplikasi peserta", description: "Prototipe mandiri untuk menjawab survei pengalaman layanan, melapor kendala, dan memantau tindak lanjut. Data sintetis." };

const STEPS = [
  "Tekan Mulai, jawab “Saya lupa / tidak yakin”.",
  "Mulai survei berikutnya, pilih “Tulis dengan kalimat sendiri”: “Sebagian. Sisanya disuruh beli di luar.”",
  "Periksa usulan, lalu tekan Benar.",
];

export default async function ParticipantPage() {
  const me = await getPrincipal("peserta");
  const home = getHome(getDb(), me);
  const demo = demoRolesEnabled();
  const options: PersonaOption[] = demo ? listPersonas("peserta").map((p) => ({ userId: p.id.split(":")[1], label: p.name, roleLabel: ROLE_LABEL[p.role], hint: ROLE_HINT[p.role], current: p.id === me.id })) : [];
  return (
    <div className="h-dvh overflow-hidden bg-paper lg:grid lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-center lg:gap-x-14 lg:px-10">
      <aside className="hidden max-w-sm lg:col-start-1 lg:row-start-1 lg:block lg:self-center lg:justify-self-end">
        <Link href="/" aria-label="Beranda SEHATI"><Brand size={30} /></Link>
        <p className="mt-7"><Pill className="bg-subtle text-ink-soft ring-1 ring-inset ring-line">Prototipe aplikasi peserta</Pill></p>
        <h2 className="mt-3 text-title-1 font-semibold leading-[1.12] tracking-tight">Dibuat untuk orang tua</h2>
        <p className="mt-3 text-body-lg leading-relaxed text-ink-soft">Satu pertanyaan per layar. Huruf besar. Tanpa gulir.</p>
        <p className="mt-3 text-body-sm leading-relaxed text-ink-soft">Pembaca jawaban bebas: <span className="font-medium text-ink">{liveAvailable() ? "AI langsung" : "penafsir aturan (simulasi)"}</span></p>
      </aside>

      <ParticipantApp initial={home} />

      <aside className="hidden w-full max-w-sm space-y-4 lg:col-start-3 lg:row-start-1 lg:block lg:self-center lg:justify-self-start">
        <section aria-label="Kontrol demo" className="panel-inset p-4">
          <PersonaSwitcher options={options} layout="stacked" />
        </section>
        <section aria-labelledby="skenario" className="rounded-card bg-card p-4 shadow-e2 ring-1 ring-line/60">
          <h2 id="skenario" className="text-body font-semibold tracking-tight">Coba skenario Bu Sari</h2>
          <ol className="mt-3 space-y-3">
            {STEPS.map((t, i) => (
              <li key={i} className="flex gap-3 text-body-sm leading-snug text-ink-soft">
                <span aria-hidden className="mt-px grid size-5 shrink-0 place-items-center rounded-full bg-brand-soft text-caption font-semibold tabular-nums text-brand-ink">{i + 1}</span>
                <span>{t}</span>
              </li>
            ))}
          </ol>
          <Link href="/console/ai" className="link mt-4 inline-flex items-center gap-1 text-body-sm">
            Jejak AI di konsol <IconArrowUpRight size={14} />
          </Link>
        </section>
        <p className="px-1 text-caption leading-snug text-muted">Data sintetis. Bukan aplikasi resmi BPJS Kesehatan.</p>
      </aside>
    </div>
  );
}
