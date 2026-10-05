import type { Metadata } from "next";
import Link from "next/link";
import { RichCodes } from "@/components/console/RichCodes";
import { IconAlert, IconArrow, IconCheckCircle, IconShieldCheck } from "@/components/console/icons";
import { CodeTag, InfoDot, PageGuide, Term } from "@/components/explain";
import { CountUp, MotionItem } from "@/components/motion";
import { Card, ClaimStatusBadge, EmptyState, MODUS_PLAIN, ModusBadge, PageBanner, Pill, RiskMeter, STAGE_PLAIN, STAGE_STATUS_DOT, STAGE_STATUS_LABEL, StageLegend, Stat } from "@/components/ui";
import { fmtDate, rupiah } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { getPrecheck } from "@/lib/queries";

export const metadata: Metadata = { title: "Pra-pengajuan · SEHATI" };

type SP = Promise<{ [k: string]: string | string[] | undefined }>;
type Verdict = "tahan" | "periksa" | "siap";

const VERDICT: Record<Verdict, { pill: string; label: string; says: string; edge: string; icon: string }> = {
  tahan: { pill: "bg-danger text-white", label: "Tahan", says: "Sebaiknya jangan dikirim dulu: ada masalah serius.", edge: "shadow-[inset_4px_0_0_var(--danger)]", icon: "×" },
  periksa: { pill: "bg-accent text-ink", label: "Periksa dulu", says: "Ada hal yang perlu dicek sebelum dikirim.", edge: "shadow-[inset_4px_0_0_var(--accent)]", icon: "!" },
  siap: { pill: "bg-ok text-white", label: "Siap dikirim", says: "Tidak ditemukan masalah pada pemeriksaan.", edge: "", icon: "✓" },
};
const STAGE_CHIP = {
  ok: "bg-ok-soft text-ok ring-ok/20",
  warn: "bg-warn-soft text-warn ring-accent/40",
  fail: "bg-danger-soft text-danger ring-danger/30",
  pending: "bg-line/60 text-muted ring-line",
} as const;

export default async function Precheck({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const v = Array.isArray(sp.v) ? sp.v[0] : sp.v;
  const filter: Verdict | "" = v === "tahan" || v === "periksa" || v === "siap" ? v : "";
  const all = getPrecheck(getDb());
  const held = all.filter((r) => r.verdict === "tahan");
  const check = all.filter((r) => r.verdict === "periksa");
  const ready = all.filter((r) => r.verdict === "siap");
  const rows = filter ? all.filter((r) => r.verdict === filter) : all;
  const chips: { key: Verdict | ""; label: string; n: number }[] = [
    { key: "", label: "Semua", n: all.length },
    { key: "tahan", label: "Tahan", n: held.length },
    { key: "periksa", label: "Periksa dulu", n: check.length },
    { key: "siap", label: "Siap dikirim", n: ready.length },
  ];

  return (
    <>
      <PageBanner
        photo="clinician"
        eyebrow="Sebelum klaim dikirim"
        title="Pra-pengajuan"
        purpose="Klaim yang masih draft di rumah sakit diperiksa lebih dulu. Kalau ada masalah, bisa diperbaiki sekarang, sebelum menjadi sengketa setelah dibayar."
      />

      <PageGuide
        id="precheck"
        intro={
          <>
            <Term k="praPengajuan">Pra-pengajuan</Term> berarti memeriksa klaim <strong>sebelum</strong> rumah sakit mengirimnya ke BPJS. Pemeriksaannya sama dengan di antrean kasus, tetapi lebih awal, jadi koreksinya lebih murah dan cepat.
          </>
        }
        steps={[
          { title: "Lihat hasilnya", body: <>Tiap klaim diberi satu <Term k="verdictPra">hasil</Term>: <strong>Tahan</strong> (jangan kirim dulu), <strong>Periksa dulu</strong>, atau <strong>Siap dikirim</strong>.</> },
          { title: "Baca enam tahap", body: <>Deretan kotak kecil adalah <Term k="tahap">enam tahap pemeriksaan</Term>. Hijau sesuai, kuning perlu dicek, merah bermasalah, abu-abu menunggu.</> },
          { title: "Baca masalahnya", body: "Kalau ada tahap kuning atau merah, penjelasannya ditulis di bawahnya dengan kalimat biasa, lengkap dengan alasannya." },
          { title: "Buka kasus bila ada", body: "Jika masalahnya sudah masuk antrean kasus, tombol \"Buka kasus\" membawa Anda ke rincian dan bukti lengkap." },
        ]}
        legend={<StageLegend />}
      />

      <section aria-label="Ringkasan" className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Klaim draft" info="praPengajuan" icon={<IconShieldCheck width={18} height={18} />} value={<CountUp value={all.length} />} hint="klaim belum dikirim RS" />
        <Stat label="Tahan" info="verdictPra" icon={<IconAlert width={18} height={18} />} value={<CountUp value={held.length} />} tone="danger" hint={held.length ? `klaim · ${rupiah(held.reduce((a, r) => a + r.claim.amount, 0))}` : "klaim"} />
        <Stat label="Periksa dulu" icon={<IconAlert width={18} height={18} />} value={<CountUp value={check.length} />} tone="warn" hint="klaim" />
        <Stat label="Siap dikirim" icon={<IconCheckCircle width={18} height={18} />} value={<CountUp value={ready.length} />} tone="ok" hint="klaim" />
      </section>

      {all.length > 0 && (
        <nav aria-label="Saring hasil" className="mb-4 flex flex-wrap items-center gap-2">
          <span className="mr-1 flex items-center gap-1.5 text-xs font-semibold text-ink-soft">
            Tampilkan hasil <InfoDot k="verdictPra" />
          </span>
          {chips.map((c) => {
            const active = filter === c.key;
            return (
              <Link
                key={c.key || "semua"}
                href={c.key ? `/console/precheck?v=${c.key}` : "/console/precheck"}
                scroll={false}
                aria-current={active ? "true" : undefined}
                className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-150 ${
                  active ? "bg-ink text-white" : "border border-line bg-card text-ink-soft hover:border-ink/30 hover:text-ink"
                }`}
              >
                {c.label}
                <span className={`rounded-full px-1.5 text-xs tabular-nums ${active ? "bg-white/20" : "bg-line text-ink-soft"}`}>{c.n}</span>
              </Link>
            );
          })}
        </nav>
      )}

      <div className="space-y-3">
        {rows.length === 0 && (
          <Card className="overflow-clip">
            <EmptyState title={all.length === 0 ? "Tidak ada klaim draft" : "Tidak ada klaim dengan hasil ini"} photo="clinician">
              {all.length === 0 ? (
                "Klaim yang disusun RS akan muncul di sini untuk diperiksa sebelum dikirim."
              ) : (
                <Link href="/console/precheck" className="font-semibold text-brand underline-offset-4 hover:underline">
                  Tampilkan semua klaim draft
                </Link>
              )}
            </EmptyState>
          </Card>
        )}
        {rows.map((r, i) => {
          const vd = VERDICT[r.verdict];
          const problems = r.stages.slice(0, 4).filter((s) => s.status === "fail" || s.status === "warn");
          return (
            <MotionItem key={r.claim.id} index={i}>
              <Card className={`p-5 md:p-6 ${vd.edge}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-bold tracking-tight" title={r.participant.name}>{r.participant.name}</h2>
                    <p className="text-sm text-ink-soft">
                      Dirawat: {r.episode.dx_text} · {fmtDate(r.episode.admit_at)}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                      <strong className="tabular-nums">{rupiah(r.claim.amount)}</strong>
                      <ClaimStatusBadge status={r.claim.status} />
                      <span className="truncate text-xs text-muted" title={r.claim.hospital}>{r.claim.hospital.replace(/ \(simulasi\)/i, "")}</span>
                    </p>
                    <p className="mt-1 flex items-center gap-1 text-[11px] text-muted">
                      Nomor klaim <CodeTag k="klaim">{r.claim.claim_no}</CodeTag>
                    </p>
                  </div>
                  <div className="text-right">
                    <Pill className={`px-3.5 py-1.5 text-sm font-bold ${vd.pill}`}>
                      <span aria-hidden>{vd.icon}</span> {vd.label}
                    </Pill>
                    <p className="mt-1 max-w-[16rem] text-xs text-ink-soft">{vd.says}</p>
                  </div>
                </div>

                <ol className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6" aria-label="Status enam tahap pemeriksaan">
                  {r.stages.map((s, j) => (
                    <li key={s.key} className={`rounded-xl px-2.5 py-2 ring-1 ${STAGE_CHIP[s.status]}`} title={`${STAGE_PLAIN[s.key]} ${s.notes.join(" ")}`}>
                      <p className="flex items-center gap-1.5 text-xs font-bold">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${STAGE_STATUS_DOT[s.status]}`} aria-hidden />
                        <span className="truncate">{j + 1}. {s.label}</span>
                      </p>
                      <p className="mt-0.5 text-[11px] font-semibold">{STAGE_STATUS_LABEL[s.status]}</p>
                    </li>
                  ))}
                </ol>

                {problems.length > 0 && (
                  <ul className="mt-3 space-y-1.5">
                    {problems.map((s) => (
                      <li key={s.key} className="rounded-xl bg-paper/80 px-3 py-2 text-sm text-ink-soft ring-1 ring-line">
                        <strong className={s.status === "fail" ? "text-danger" : "text-warn"}>{s.label}</strong>
                        <span className="text-muted"> ({STAGE_STATUS_LABEL[s.status].toLowerCase()})</span>: {s.notes.join(" ")}
                      </li>
                    ))}
                  </ul>
                )}

                {r.findings.map((f) => (
                  <div key={f.modus} className="border border-line bg-paper mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl p-3 text-sm">
                    <div className="space-y-1.5">
                      <ModusBadge modus={f.modus} plain explain icon />
                      <RiskMeter severity={f.severity as "low" | "medium" | "high"} score={f.score} />
                    </div>
                    <div className="min-w-0 flex-1 basis-56">
                      <p className="font-semibold">{MODUS_PLAIN[f.modus].headline}</p>
                      <p className="text-ink-soft"><RichCodes text={f.summary} /></p>
                    </div>
                    {f.caseId && (
                      <Link href={`/console/cases/${f.caseId}`} className="btn-gold inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold">
                        Buka kasus <IconArrow width={14} height={14} />
                      </Link>
                    )}
                  </div>
                ))}
              </Card>
            </MotionItem>
          );
        })}
      </div>
    </>
  );
}
