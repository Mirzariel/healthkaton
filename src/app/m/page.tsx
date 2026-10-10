import type { Metadata } from "next";
import Link from "next/link";
import { Brand } from "@/components/Brand";
import { ParticipantApp } from "@/components/m/ParticipantApp";
import { PersonaSwitcher, type PersonaOption } from "@/components/Shell";
import { ROLE_HINT, ROLE_LABEL } from "@/lib/auth/principal";
import { liveAvailable } from "@/lib/ai/invocations";
import { getDb } from "@/lib/db";
import { demoRolesEnabled, getPrincipal, listPersonas } from "@/lib/server";
import { getHome } from "@/lib/survey/participant";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Aplikasi peserta", description: "Prototipe mandiri untuk menjawab survei pengalaman layanan, melapor kendala, dan memantau tindak lanjut. Data sintetis." };

export default async function ParticipantPage() {
  const me = await getPrincipal("peserta");
  const home = getHome(getDb(), me);
  const demo = demoRolesEnabled();
  const options: PersonaOption[] = demo ? listPersonas("peserta").map((p) => ({ userId: p.id.split(":")[1], label: p.name, roleLabel: ROLE_LABEL[p.role], hint: ROLE_HINT[p.role], current: p.id === me.id })) : [];
  return (
    <div className="min-h-dvh bg-paper md:grid md:justify-items-center md:gap-8 md:px-6 md:py-6 lg:grid-cols-[1fr_auto_1fr] lg:items-center lg:gap-14">
      <div className="hidden max-w-sm md:block lg:justify-self-end">
        <Link href="/" aria-label="Beranda SEHATI"><Brand size={30} /></Link>
        <p className="eyebrow mt-6 text-muted">Aplikasi peserta (prototipe)</p>
        <h1 className="mt-3 text-[2rem] font-semibold leading-[1.1] tracking-tight">Memastikan layanan yang dijanjikan <em>benar-benar diterima</em></h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">Peserta menjawab pertanyaan singkat tentang pengalamannya, boleh dengan kalimat sendiri. Sistem menunjukkan apa yang ditangkapnya dan menunggu konfirmasi sebelum menyimpannya sebagai jawaban.</p>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">Mesin yang membaca kalimat bebas saat ini: <strong>{liveAvailable() ? "penyedia AI langsung (bila konfigurasi aktif)" : "penafsir aturan berlabel simulasi"}</strong>. Pilihan pertanyaan tetap ditentukan aturan dari bank yang ditinjau.</p>
      </div>
      <ParticipantApp initial={home} />
      <div className="hidden w-full max-w-sm space-y-4 md:block lg:justify-self-start">
        <div>
          <p className="eyebrow text-muted">Khusus demo</p>
          <div className="mt-2"><PersonaSwitcher options={options} /></div>
          <p className="mt-2 text-xs text-muted">Ganti ke pendamping untuk melihat bahwa jawaban pendamping dicatat terpisah dan tidak disamakan dengan pengalaman langsung peserta.</p>
        </div>
        <div className="border-t border-line pt-4 text-sm text-ink-soft">
          <p className="font-semibold text-ink">Coba skenario Bu Sari</p>
          <ol className="mt-1 list-decimal space-y-1 pl-5">
            <li>Jawab satu pertanyaan singkat tentang bronkoskopi (pilih “Saya lupa / tidak yakin” untuk melihat ketidakpastian ditangani netral).</li>
            <li>Mulai survei pasca rawat inap, lalu ketik: “Sebagian. Sisanya disuruh beli di luar.”</li>
            <li>Periksa ringkasan pemahaman, ubah bila perlu, dan konfirmasi.</li>
          </ol>
          <Link href="/console/ai" className="mt-3 inline-block font-semibold text-brand underline underline-offset-4">Lihat jejak AI di konsol petugas →</Link>
        </div>
      </div>
    </div>
  );
}
