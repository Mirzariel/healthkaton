import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { PageGuide, Term } from "@/components/explain";
import { PrintButton } from "@/components/PrintButton";
import { Breadcrumb } from "@/components/ui";
import { DECISION_LABEL } from "@/lib/actions";
import { verifyChain, type AuditRow } from "@/lib/audit";
import { clock, describeAudit, shortHash } from "@/lib/auditView";
import { fmtDate, fmtDateTime, rupiah } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { MODUS_LABEL } from "@/lib/engine/detectors";
import { getSeedNow, getStats, listCases } from "@/lib/queries";

export const metadata: Metadata = { title: "Laporan audit · SEHATI" };
export const dynamic = "force-dynamic";

const KEEP_COLOR = { printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" } as CSSProperties;

export default function AuditReport() {
  const db = getDb();
  const stats = getStats(db);
  const chain = verifyChain(db);
  const decided = listCases(db, { status: "decided" }).sort((a, b) => (b.decided_at ?? "").localeCompare(a.decided_at ?? ""));
  const count = (d: string) => decided.filter((c) => c.decision === d).length;
  const corrected = decided.reduce((a, c) => a + (c.correction_amount ?? 0), 0);
  const head = db.prepare("SELECT hash FROM audit_log ORDER BY id DESC LIMIT 1").get() as { hash: string } | undefined;
  const recent = describeAudit(db, db.prepare("SELECT * FROM audit_log ORDER BY id DESC LIMIT 10").all() as AuditRow[]);

  const mix = [
    { key: "loloskan", color: "#17804c" },
    { key: "koreksi", color: "#e9a43a" },
    { key: "tolak", color: "#c8323a" },
    { key: "eskalasi", color: "#2160b0" },
    { key: "dicabut_otomatis", color: "#667a7e" },
  ] as const;
  const mixTotal = mix.reduce((a, m) => a + count(m.key), 0);

  const kpis: [string, string, string][] = [
    ["Total kasus", String(stats.total), "kasus dibuka sistem"],
    ["Sudah selesai", String(stats.decided), "sudah ada keputusan"],
    ["Masih berjalan", String(stats.open + stats.clarification), "menunggu petugas"],
    ["Nilai dikoreksi", rupiah(corrected), "dipotong dari klaim"],
  ];

  return (
    <>
      <Breadcrumb items={[{ label: "Jejak audit", href: "/console/audit" }, { label: "Laporan cetak" }]} />
      <PageGuide
        id="audit-report"
        intro="Halaman ini adalah ringkasan satu lembar untuk dicetak atau disimpan sebagai PDF (tombol Cetak di kanan atas laporan). Panduan ini tidak ikut tercetak."
        steps={[
          { title: "Angka ringkas", body: "Berapa kasus ada, berapa yang sudah selesai, dan berapa rupiah yang dikoreksi." },
          { title: "Keutuhan catatan", body: <>Menyatakan bahwa <Term k="rantai">rantai hash</Term> utuh, jadi catatan di bawah tidak pernah diubah.</> },
          { title: "Daftar keputusan", body: "Satu baris per kasus selesai, lengkap dengan alasan petugas." },
        ]}
      />
      <article className="mx-auto max-w-4xl rounded-xl border border-line bg-card p-5 md:p-8 print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4 border-b-2 border-ink pb-4">
          <div>
            <p className="eyebrow text-brand">SEHATI · Laporan audit penyelesaian kasus</p>
            <h1 className="mt-1 text-3xl font-semibold leading-tight">
              Ringkasan temuan, <em>keputusan</em>, dan koreksi
            </h1>
            <p className="mt-1 text-sm text-ink-soft">
              Per {fmtDateTime(getSeedNow(db))} · <strong>DATA SIMULASI</strong>, bukan data peserta JKN sungguhan.
            </p>
          </div>
          <PrintButton />
        </div>

        <section aria-label="Angka ringkas" className="mb-6 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          {kpis.map(([label, value, hint]) => (
            <div key={label} className="rounded-lg border border-line p-3.5">
              <p className="text-xs font-semibold text-muted">{label}</p>
              <p className="mt-0.5 text-2xl font-semibold tabular-nums">{value}</p>
              <p className="text-[11px] text-muted">{hint}</p>
            </div>
          ))}
        </section>

        <section className={`mb-6 break-inside-avoid rounded-xl border-2 p-4 text-sm ${chain.ok ? "border-ok/40" : "border-danger/50"}`} aria-label="Integritas jejak audit">
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`grid size-11 shrink-0 place-items-center rounded-full text-2xl font-bold text-white ${chain.ok ? "bg-ok" : "bg-danger"}`}
              style={KEEP_COLOR}
              aria-hidden
            >
              {chain.ok ? "✓" : "×"}
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold">
                {chain.ok ? (
                  <>
                    <Term k="rantai">Rantai</Term> catatan utuh
                  </>
                ) : (
                  `Rantai catatan putus pada catatan #${chain.brokenAt}`
                )}
              </h2>
              <p className="text-ink-soft">
                {chain.total} catatan diperiksa ulang satu per satu
                {chain.ok ? "; tidak ada yang berubah sejak ditulis." : ". Isi salah satu catatan berbeda dari saat ditulis; laporan ini perlu diselidiki."}
              </p>
            </div>
          </div>
          {head && (
            <p className="mt-3 rounded-lg bg-paper px-3 py-2 text-xs text-ink-soft" style={KEEP_COLOR}>
              <Term k="hash">Sidik jari</Term> catatan terakhir (untuk pencocokan bila laporan dicetak):{" "}
              <span className="font-mono font-semibold text-ink">{shortHash(head.hash, 16)}</span>
            </p>
          )}
        </section>

        <section className="mb-6 break-inside-avoid" aria-label="Komposisi keputusan">
          <h2 className="mb-2 text-lg font-semibold">Hasil keputusan petugas</h2>
          {mixTotal > 0 && (
            <div className="mb-3 flex h-3 overflow-hidden rounded-full border border-line" style={KEEP_COLOR} role="img" aria-label="Perbandingan jenis keputusan">
              {mix.map((m) => count(m.key) > 0 && <span key={m.key} style={{ width: `${(count(m.key) / mixTotal) * 100}%`, background: m.color, ...KEEP_COLOR }} />)}
            </div>
          )}
          <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {mix.map((m) => (
              <li key={m.key} className="flex items-center gap-2">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: m.color, ...KEEP_COLOR }} aria-hidden />
                <span className="flex-1">{DECISION_LABEL[m.key]}</span>
                <strong className="tabular-nums">{count(m.key)}</strong>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-ink-soft">
            Kasus sah yang diperiksa lalu diloloskan: <strong className="text-ink">{stats.lookalikeCleared}</strong>. Artinya sistem tidak menghukum klaim yang ternyata wajar.
          </p>
        </section>

        <h2 className="mb-2 text-lg font-semibold">Daftar keputusan</h2>
        <div className="mb-6 overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-xs print:min-w-0">
            <thead>
              <tr className="border-b-2 border-ink text-[11px] uppercase tracking-wide">
                <th className="py-1.5 pr-2">
                  <Term k="kasus">Kasus</Term>
                </th>
                <th className="py-1.5 pr-2">Jenis temuan</th>
                <th className="py-1.5 pr-2">
                  <Term k="klaim">Klaim</Term>
                </th>
                <th className="py-1.5 pr-2">Keputusan</th>
                <th className="py-1.5 pr-2">Alasan</th>
                <th className="py-1.5">Tanggal</th>
              </tr>
            </thead>
            <tbody>
              {decided.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-muted">
                    Belum ada kasus yang diputuskan.
                  </td>
                </tr>
              )}
              {decided.map((c) => (
                <tr key={c.id} className="break-inside-avoid border-b border-line align-top">
                  <td className="py-2 pr-2">
                    <span className="block font-mono font-semibold">{c.id}</span>
                    <span className="text-muted">{c.participant_name}</span>
                  </td>
                  <td className="py-2 pr-2">{MODUS_LABEL[c.modus]}</td>
                  <td className="py-2 pr-2 font-mono">{c.claim_no}</td>
                  <td className="py-2 pr-2 font-semibold">
                    {DECISION_LABEL[c.decision as keyof typeof DECISION_LABEL] ?? c.decision}
                    {c.correction_amount ? <span className="block font-normal text-ink-soft">{rupiah(c.correction_amount)}</span> : null}
                  </td>
                  <td className="py-2 pr-2">{c.decision_reason}</td>
                  <td className="whitespace-nowrap py-2">{fmtDate(c.decided_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <section className="break-inside-avoid" aria-label="Catatan terakhir">
          <h2 className="mb-2 text-lg font-semibold">10 catatan terakhir di jejak audit</h2>
          <ol className="space-y-1.5 text-xs">
            {recent.map((v) => (
              <li key={v.id} className="flex gap-3 border-b border-line/70 pb-1.5">
                <span className="w-28 shrink-0 tabular-nums text-muted">
                  {fmtDate(v.ts)} {clock(v.ts)}
                </span>
                <span className="flex-1">
                  <strong>{v.meta.label}:</strong> {v.text}
                </span>
                <span className="shrink-0 font-mono text-[10px] text-muted">#{v.id}</span>
              </li>
            ))}
          </ol>
        </section>

        <p className="mt-6 border-t border-line pt-3 text-[11px] text-muted">
          Dokumen ini dihasilkan otomatis oleh prototipe SEHATI (Healthkathon 2026) dari data simulasi. Keputusan akhir tetap berada pada petugas BPJS Kesehatan.
        </p>
      </article>
    </>
  );
}
