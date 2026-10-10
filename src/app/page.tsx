import Link from "next/link";
import { Brand } from "@/components/Brand";
import { SourceBadge } from "@/components/ui";
import { getAdapters } from "@/lib/adapters";
import { liveAvailable } from "@/lib/ai/invocations";
import { getDb } from "@/lib/db";
import { FINDING_LABEL, PROOF_LABEL, type FindingType, type ProofStatus } from "@/lib/labels";
import { SURFACES } from "@/lib/nav";

export const dynamic = "force-dynamic";

const STAGES = [
  ["Sebelum layanan", "Peserta menjawab beberapa pertanyaan singkat tentang apa yang dijanjikan dan diharapkan."],
  ["Selama layanan", "Pertanyaan menyesuaikan apa yang sedang terjadi, tanpa menyebut diagnosis yang belum Anda ketahui."],
  ["Setelah layanan", "Peserta mengonfirmasi apa yang benar-benar diterima. “Tidak ingat” dan “tidak paham” tidak dihitung sebagai jawaban."],
  ["Konfirmasi terarah", "Hanya bila ada tanda yang perlu dipastikan: satu pertanyaan pendek tentang satu layanan."],
] as const;

const PRINCIPLES = [
  "Penyebab baru dibicarakan setelah masalah terbukti dan faskes sempat menjawab.",
  "Tanda awal disebut sinyal, bukan kesimpulan. Bahasa dijaga netral.",
  "Jawaban “tidak tahu”, “tidak paham”, atau tidak menjawab tidak menambah kecurigaan.",
  "Kepuasan peserta tidak pernah menjadi dasar indikasi.",
  "Tidak ada pembayaran, koreksi klaim, atau sanksi otomatis. Keputusan ada pada manusia.",
  "Setiap perubahan tercatat di jejak audit berantai hash.",
];

export default function Home() {
  const db = getDb();
  const hero = db.prepare("SELECT f.type, f.summary, f.proof_status FROM findings f WHERE f.episode_id IN ('E-0001','E-0002') ORDER BY f.id").all() as { type: FindingType; summary: string; proof_status: ProofStatus }[];
  const n = db.prepare("SELECT (SELECT COUNT(*) FROM participants) p, (SELECT COUNT(*) FROM facilities) f, (SELECT COUNT(*) FROM findings) fi, (SELECT COUNT(*) FROM findings WHERE proof_status='verified') v").get() as { p: number; f: number; fi: number; v: number };
  const a = getAdapters(db);
  const statuses = [a.claimFeed, a.evidence, a.identity, a.notification, a.paymentStatus].map((x) => x.status());
  const live = SURFACES.filter((s) => s.ready);
  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5">
        <Brand size={32} />
        {live.map((s) => <Link key={s.href} href={s.href} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white">{s.label}</Link>)}
      </header>
      <main className="mx-auto max-w-5xl space-y-16 px-4 pb-20 pt-8">
        <section>
          <p className="eyebrow text-muted">JKN · Efisiensi risiko pada fasilitas kesehatan</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold leading-tight tracking-tight md:text-5xl">Memastikan layanan yang dijanjikan benar-benar diterima, dan masalahnya ditindaklanjuti.</h1>
          <p className="mt-4 max-w-2xl text-lg text-ink-soft">SEHATI menghubungkan pengalaman peserta, catatan faskes, dan data klaim dalam satu rangkaian episode. Petugas membuktikan, faskes menjawab, perbaikan dicatat dan ditindaklanjuti.</p>
          <p className="mt-3 max-w-2xl rounded-lg border border-line bg-brand-soft/60 px-3 py-2 text-sm text-ink-soft">Seluruh data pada lingkungan ini <strong>sintetis</strong>. Tidak terhubung ke sistem BPJS Kesehatan atau faskes nyata.</p>
        </section>

        <section aria-labelledby="audiences">
          <h2 id="audiences" className="text-xl font-semibold">Untuk siapa</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {[
              ["Peserta", "Menjawab survei singkat, melaporkan kendala, dan mengonfirmasi apakah masalahnya sudah selesai."],
              ["Faskes", "Menerima klarifikasi, menjawab dengan bukti, dan menyusun rencana perbaikan. Hak jawab selalu diberikan lebih dulu."],
              ["Petugas", "Memeriksa sinyal, meminta klarifikasi, dan memutuskan. AI membantu menyiapkan, tidak memutuskan."],
            ].map(([t, d]) => (
              <div key={t} className="rounded-xl border border-line bg-card p-5"><h3 className="font-semibold">{t}</h3><p className="mt-1.5 text-sm text-ink-soft">{d}</p></div>
            ))}
          </div>
        </section>

        <section aria-labelledby="stages">
          <h2 id="stages" className="text-xl font-semibold">Tiga tahap survei dan satu konfirmasi terarah</h2>
          <ol className="mt-4 grid gap-3 md:grid-cols-4">
            {STAGES.map(([t, d], i) => (
              <li key={t} className="rounded-xl border border-line bg-card p-4"><p className="font-mono text-xs text-muted">0{i + 1}</p><h3 className="mt-1 font-semibold">{t}</h3><p className="mt-1.5 text-sm text-ink-soft">{d}</p></li>
            ))}
          </ol>
          <p className="mt-3 max-w-3xl text-sm text-ink-soft">Peran AI: memilih pertanyaan berikutnya dari bank pertanyaan yang sudah ditinjau, memahami jawaban bebas, dan merangkum untuk petugas. AI tidak menambah standar, tidak menyimpulkan penyebab, dan tidak memutuskan. Mesin yang aktif saat ini: <strong>{liveAvailable() ? "penyedia langsung" : "simulator deterministik berlabel"}</strong>.</p>
        </section>

        <section aria-labelledby="story">
          <h2 id="story" className="text-xl font-semibold">Contoh: Bu Sari</h2>
          <p className="mt-2 max-w-3xl text-sm text-ink-soft">Bu Sari dirawat di sebuah rumah sakit, lalu pulang dan kembali kontrol. Dari data sintetis, sistem memunculkan beberapa sinyal. Semuanya masih sinyal: belum ada yang dibuktikan.</p>
          <ul className="mt-4 space-y-2">
            {hero.map((h, i) => (
              <li key={i} className="rounded-xl border border-line bg-card p-4 text-sm">
                <p className="font-semibold">{FINDING_LABEL[h.type].label} <span className="ml-2 text-xs font-medium text-muted">{PROOF_LABEL[h.proof_status].label}</span></p>
                <p className="mt-1 text-ink-soft">{h.summary}</p>
              </li>
            ))}
          </ul>
          <p className="mt-3 max-w-3xl text-sm text-ink-soft">Langkah berikutnya bukan tuduhan: petugas mencari catatan pelaksanaan, faskes diminta menjelaskan, dan baru setelah itu ada keputusan.</p>
        </section>

        <section aria-labelledby="numbers">
          <h2 id="numbers" className="text-xl font-semibold">Angka dari data sintetis</h2>
          <dl className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[["Peserta", n.p], ["Faskes", n.f], ["Temuan berstatus sinyal atau lebih", n.fi], ["Temuan terbukti", n.v]].map(([l, v]) => (
              <div key={String(l)} className="rounded-xl border border-line bg-card p-4"><dt className="text-xs font-medium text-ink-soft">{l}</dt><dd className="mt-1 text-3xl font-semibold tabular-nums">{v}</dd></div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-muted">Angka berasal dari basis data yang sama dengan konsol petugas. Jumlah temuan adalah hasil aturan pada data rekaan, bukan prevalensi di dunia nyata.</p>
        </section>

        <section aria-labelledby="principles">
          <h2 id="principles" className="text-xl font-semibold">Prinsip yang ditegakkan sistem</h2>
          <ul className="mt-4 grid gap-2 md:grid-cols-2">
            {PRINCIPLES.map((p) => <li key={p} className="rounded-lg border border-line bg-card px-4 py-3 text-sm">{p}</li>)}
          </ul>
        </section>

        <section aria-labelledby="limits">
          <h2 id="limits" className="text-xl font-semibold">Batas integrasi saat ini</h2>
          <div className="mt-4 divide-y divide-line rounded-xl border border-line bg-card">
            {statuses.map((s) => (
              <div key={s.name} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"><span className="font-medium">{s.name}</span><span className="flex items-center gap-2 text-ink-soft"><span className="hidden sm:inline">{s.detail}</span><SourceBadge source={s.source} /></span></div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
