import type { Metadata } from "next";
import Link from "next/link";
import { ChainSeal } from "@/components/audit/ChainSeal";
import { InfoDot, PageGuide, Term } from "@/components/explain";
import { Card, EmptyState, PageHeader, Pill } from "@/components/ui";
import { verifyChain, type AuditRow } from "@/lib/audit";
import { ACTOR_META, actorMeta, clock, dayHeading, describeAudit, shortHash, type AuditView } from "@/lib/auditView";
import { getDb } from "@/lib/db";

export const metadata: Metadata = { title: "Jejak audit · SEHATI" };
export const dynamic = "force-dynamic";

const FILTERS = [
  { key: "semua", label: "Semua", actors: null },
  { key: "petugas", label: "Petugas", actors: ["casemix", "verifikator", "auditor", "dokter"] },
  { key: "peserta", label: "Peserta", actors: ["peserta"] },
  { key: "sistem", label: "Sistem", actors: ["sistem", "otomatis"] },
] as const;

function Entry({ v }: { v: AuditView }) {
  return (
    <li className="relative grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 px-4 py-3.5 transition-colors hover:bg-paper md:grid-cols-[auto_minmax(0,1fr)_auto] md:px-5">
      <span aria-hidden className="relative mt-1.5 flex flex-col items-center">
        <span className={`size-2 rounded-full ${v.meta.dot}`} />
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Pill className={v.meta.badge}>{v.meta.label}</Pill>
          <span className="text-xs tabular-nums text-muted">{clock(v.ts)} WIB</span>
        </div>
        <p className="mt-1.5 text-[15px] leading-relaxed text-ink">
          {v.parts.map((x, i) => (x.b ? <strong key={i} className="font-semibold">{x.t}</strong> : <span key={i}>{x.t}</span>))}
        </p>
        {v.quote && (
          <p className="mt-1.5 border-l-2 border-line pl-3 text-[13px] italic leading-relaxed text-ink-soft">Alasan: “{v.quote}”</p>
        )}
        {v.object && (
          <p className="mt-2 text-xs">
            {v.object.href ? (
              <Link href={v.object.href} className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-line bg-card px-2.5 py-1 font-semibold text-brand transition hover:border-brand">
                <span>{v.object.kind} {v.object.label}</span>
                <span aria-hidden>→</span>
              </Link>
            ) : (
              <span className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-line bg-paper px-2.5 py-1 font-semibold text-ink-soft">{v.object.kind}: {v.object.label}</span>
            )}
            {v.object.sub && <span className="ml-2 text-muted">{v.object.sub}</span>}
          </p>
        )}
      </div>
      <p className="col-start-2 mt-2 text-[11px] text-muted md:col-start-3 md:mt-1 md:text-right" title={`Sidik jari lengkap: ${v.hash}`}>
        <span className="block">Catatan #{v.id}</span>
        <span className="font-mono">{shortHash(v.hash)}…</span>
      </p>
    </li>
  );
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.pelaku) ? sp.pelaku[0] : sp.pelaku;
  const filter = FILTERS.find((f) => f.key === raw) ?? FILTERS[0];
  const db = getDb();
  const chain = verifyChain(db);
  const where = filter.actors ? `WHERE actor IN (${filter.actors.map(() => "?").join(",")})` : "";
  const rows = db.prepare(`SELECT * FROM audit_log ${where} ORDER BY ts DESC, id DESC LIMIT 150`).all(...(filter.actors ?? [])) as AuditRow[];
  const latest = db.prepare("SELECT id, hash FROM audit_log ORDER BY id DESC LIMIT 4").all() as { id: number; hash: string }[];
  const views = describeAudit(db, rows);

  const groups: { day: string; items: AuditView[] }[] = [];
  for (const v of views) {
    const day = dayHeading(v.ts);
    const g = groups[groups.length - 1];
    if (g && g.day === day) g.items.push(v);
    else groups.push({ day, items: [v] });
  }

  return (
    <>
      <PageHeader title="Jejak audit" purpose="Buku catatan yang tidak bisa diubah diam-diam: siapa melakukan apa, kapan, pada kasus mana.">
        <Link href="/console/audit/report" className="btn-depth rounded-lg px-4 py-2 text-sm font-bold text-white">
          Laporan cetak
        </Link>
      </PageHeader>

      <PageGuide
        id="audit"
        intro="Setiap kali ada yang terjadi di SEHATI (kasus dibuka, peserta menjawab, petugas memutuskan), tercatat satu baris di sini. Catatan hanya bisa ditambah, tidak bisa dihapus atau diubah."
        steps={[
          { title: "Baca kalimatnya", body: "Tiap baris sudah ditulis sebagai kalimat biasa: siapa, melakukan apa, pada kasus atau layanan yang mana." },
          { title: "Lihat siapa pelakunya", body: "Lencana warna menunjukkan pelaku: petugas rumah sakit/BPJS, peserta, atau sistem otomatis." },
          { title: "Percayai rantai utuh", body: <>Kotak hijau di atas memeriksa ulang seluruh catatan. <Term k="rantai">Rantai utuh</Term> berarti tidak ada catatan yang diubah.</> },
        ]}
        legend={
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="font-semibold">Pelaku:</span>
            {Object.entries(ACTOR_META).map(([k, m]) => (
              <span key={k} className="inline-flex items-center gap-1.5"><Pill className={m.badge}>{m.label}</Pill></span>
            ))}
            <span className="text-muted">Kode abu-abu di kanan tiap baris = <Term k="hash">sidik jari digital</Term> catatan itu (hanya untuk verifikasi, tidak perlu dibaca).</span>
          </div>
        }
      />

      <ChainSeal chain={chain} links={latest.slice().reverse()} />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Saring menurut pelaku" className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => {
            const on = f.key === filter.key;
            return (
              <Link
                key={f.key}
                href={f.key === "semua" ? "/console/audit" : `/console/audit?pelaku=${f.key}`}
                aria-current={on ? "page" : undefined}
                className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${on ? "bg-ink text-white" : "border border-line bg-card text-ink-soft hover:border-ink/40"}`}
              >
                {f.label}
              </Link>
            );
          })}
        </nav>
        <p className="flex items-center gap-1.5 text-xs text-muted">
          Menampilkan {views.length} catatan terbaru{filter.key !== "semua" ? ` dari ${filter.label.toLowerCase()}` : ""} · total {chain.total}
          <span className="inline-flex items-center gap-1">· sidik jari <InfoDot k="hash" /></span>
        </p>
      </div>

      <Card className="overflow-clip !shadow-none">
        {views.length === 0 && <EmptyState title="Belum ada catatan">Catatan akan muncul begitu ada tindakan pada kasus.</EmptyState>}
        {groups.map((g, gi) => (
          <section key={`${gi}-${g.day}`} aria-label={g.day}>
            <h2 className="border-y border-line bg-paper px-5 py-1.5 font-sans text-xs font-bold uppercase tracking-wider text-muted first:border-t-0">{g.day}</h2>
            <ul className="divide-y divide-line/70">
              {g.items.map((v) => <Entry key={v.id} v={v} />)}
            </ul>
          </section>
        ))}
      </Card>
      <p className="mt-2 text-xs text-muted">Pelaku &quot;{actorMeta("sistem").label}&quot; berarti dicatat otomatis oleh mesin pemeriksa, bukan oleh orang.</p>
    </>
  );
}
