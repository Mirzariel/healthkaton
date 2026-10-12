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
  "Jawab satu pertanyaan tentang bronkoskopi. Coba “Saya lupa / tidak yakin”.",
  "Mulai survei pasca rawat inap, lalu ketik: “Sebagian. Sisanya disuruh beli di luar.”",
  "Periksa ringkasan, ubah bila perlu, lalu konfirmasi.",
];

export default async function ParticipantPage() {
  const me = await getPrincipal("peserta");
  const home = getHome(getDb(), me);
  const demo = demoRolesEnabled();
  const options: PersonaOption[] = demo ? listPersonas("peserta").map((p) => ({ userId: p.id.split(":")[1], label: p.name, roleLabel: ROLE_LABEL[p.role], hint: ROLE_HINT[p.role], current: p.id === me.id })) : [];
  return (
    <div className="min-h-dvh bg-paper md:grid md:grid-cols-[minmax(0,1fr)_400px] md:content-center md:gap-x-10 md:gap-y-8 md:px-8 md:py-6 lg:grid-cols-[minmax(0,1fr)_400px_minmax(0,1fr)] lg:gap-x-14 lg:gap-y-0">
      <aside className="hidden max-w-sm md:col-start-1 md:row-start-1 md:block md:self-end lg:max-w-md lg:justify-self-end lg:self-center">
        <Link href="/" aria-label="Beranda SEHATI"><Brand size={30} /></Link>
        <p className="mt-7"><Pill className="bg-subtle text-ink-soft ring-1 ring-inset ring-line">Prototipe aplikasi peserta</Pill></p>
        <h2 className="mt-3 text-[1.75rem] font-semibold leading-[1.12] tracking-tight lg:text-[2rem]">Layanan yang dijanjikan, benar‑benar diterima</h2>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">Peserta menjawab dengan kalimat sendiri. Sistem menunjukkan apa yang ditangkapnya dan menunggu konfirmasi.</p>
        <p className="mt-3 text-[13px] leading-relaxed text-muted">Pembaca jawaban bebas: <span className="font-medium text-ink-soft">{liveAvailable() ? "AI langsung" : "penafsir aturan (simulasi)"}</span></p>
      </aside>

      <ParticipantApp initial={home} />

      <aside className="hidden w-full max-w-sm space-y-4 md:col-start-1 md:row-start-2 md:block md:self-start lg:col-start-3 lg:row-start-1 lg:self-center lg:justify-self-start">
        <section aria-label="Kontrol demo" className="panel-inset p-4">
          <PersonaSwitcher options={options} layout="stacked" />
          <p className="mt-2.5 text-[12.5px] leading-snug text-muted">Pendamping dicatat terpisah dari pengalaman langsung peserta.</p>
        </section>
        <section aria-labelledby="skenario" className="rounded-xl border border-line bg-card p-4 shadow-depth-2">
          <h2 id="skenario" className="text-[15px] font-semibold tracking-tight">Coba skenario Bu Sari</h2>
          <ol className="mt-3 space-y-3">
            {STEPS.map((t, i) => (
              <li key={i} className="flex gap-3 text-[13.5px] leading-snug text-ink-soft">
                <span aria-hidden className="mt-px grid size-5 shrink-0 place-items-center rounded-full bg-brand-soft text-[11.5px] font-semibold tabular-nums text-brand-ink">{i + 1}</span>
                <span>{t}</span>
              </li>
            ))}
          </ol>
          <Link href="/console/ai" className="link mt-4 inline-flex items-center gap-1 text-[13.5px]">
            Jejak AI di konsol <IconArrowUpRight size={14} />
          </Link>
        </section>
        <p className="px-1 text-[12px] leading-snug text-muted">Prototipe dengan data sintetis. Bukan aplikasi resmi BPJS Kesehatan.</p>
      </aside>
    </div>
  );
}
