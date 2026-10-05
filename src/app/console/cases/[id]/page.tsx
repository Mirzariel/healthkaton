import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AssignForm, DecisionForm, MessageForm, MessageThread } from "@/components/CaseActions";
import { AutoDecisionCard, AutoSuggestion, AutoWaitingCard } from "@/components/console/Autopilot";
import { RichCodes } from "@/components/console/RichCodes";
import { IconArrow, IconFlag } from "@/components/console/icons";
import { CodeTag, InfoDot, PageGuide, Term } from "@/components/explain";
import { Card, CaseStatusBadge, ClaimStatusBadge, DueLabel, EvidenceBadge, MODUS_PLAIN, ModusBadge, PageHeader, ScoreMeter, SectionTitle, StageLegend, StageStepper } from "@/components/ui";
import { DECISION_LABEL, ROLE_LABEL } from "@/lib/actions";
import { fmtDate, fmtDateTime, rupiah } from "@/lib/dates";
import { getAuto, getMode, proposeDecision } from "@/lib/autopilot";
import { getDb } from "@/lib/db";
import { getCaseDetail, getSeedNow } from "@/lib/queries";
import { getRole } from "@/lib/server";
import type { Modus, Role } from "@/lib/types";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Kasus ${id} · SEHATI` };
}

const ANSWER_LABEL = { sesuai: "Peserta mengaku: sesuai", tidak_sesuai: "Peserta mengaku: tidak sesuai", tidak_ingat: "Peserta: tidak ingat" } as const;
const ANSWER_CLS = { sesuai: "text-ok", tidak_sesuai: "font-bold text-danger", tidak_ingat: "text-muted" } as const;

/** Batas kesimpulan, versi singkat. Teks lengkap tetap tersedia lewat tooltip. */
const LIMIT_SHORT: Record<Modus, string> = {
  repeat_billing: "Mirip belum tentu duplikat. Cek indikasi medis dan bukti dulu.",
  fragmentation: "Bisa sah bila ada indikasi medis. Sistem hanya menandai kedekatan waktu.",
  phantom: "Bukti kosong belum berarti tidak dilakukan; dokumen mungkin belum terunggah.",
};
const CHECK_HINT: Record<Modus, string> = {
  repeat_billing: "Bandingkan dengan klaim pembanding.",
  fragmentation: "Cek apakah ada indikasi medis untuk pemecahan.",
  phantom: "Minta bukti untuk layanan yang kosong.",
};
/** Kalimat penjelas satu baris untuk hero, per jenis dugaan. */
const WHAT: Record<Modus, (p: string, h: string) => string> = {
  phantom: (p, h) => `Rumah sakit ${h} menagihkan tindakan untuk ${p}, tetapi sebagian tindakan itu belum ada buktinya.`,
  repeat_billing: (p, h) => `Perawatan ${p} di ${h} tampak ditagihkan lebih dari sekali.`,
  fragmentation: (p, h) => `Satu rangkaian perawatan ${p} di ${h} tampak dipecah menjadi beberapa klaim.`,
};
/** Nama kejadian di jejak audit, dalam bahasa biasa. */
const AUDIT_LABEL: Record<string, string> = {
  kasus_dibuka: "membuka kasus",
  kasus_ditugaskan: "menugaskan kasus",
  pesan_klarifikasi: "mengirim pesan klarifikasi",
  keputusan: "mencatat keputusan",
  konfirmasi_layanan: "menjawab konfirmasi layanan",
};

function Fact({ label, info, children }: { label: string; info?: Parameters<typeof InfoDot>[0]["k"]; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1 text-xs font-semibold text-muted">
        {label}
        {info && <InfoDot k={info} />}
      </dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const d = getCaseDetail(db, id);
  if (!d) notFound();
  const role = await getRole();
  const seedNow = getSeedNow(db);
  const decided = d.row.status === "decided";
  const canDecide = role === "verifikator" || role === "auditor";
  const auto = getAuto(db, d.row.id);
  const autoDecided = decided && auto?.state === "diputus" && auto.review_status !== "dibuka_kembali";
  const autoWaiting = !decided && auto?.state === "menunggu_peserta";
  const suggestion = !decided && !autoWaiting && getMode(db) === "manual" ? proposeDecision(db, d.row.id) : null;
  const totalAmount = d.services.reduce((a, s) => a + s.service.amount, 0);
  const lacking = d.services.filter((s) => s.check.state !== "tersedia").length;
  const lastMsg = d.messages[d.messages.length - 1];
  const hospitalReplied = !!lastMsg && (lastMsg.role === "casemix" || lastMsg.role === "dokter");
  const plain = MODUS_PLAIN[d.row.modus];
  const em = plain.short.toLowerCase();

  // Satu langkah berikutnya, sesuai peran dan status.
  let next: { title: string; hint: string; cta?: { href: string; label: string }; alt?: { href: string; label: string } };
  if (autoDecided && auto) {
    next = auto.review_status === "belum"
      ? { title: `Diputus otomatis: ${DECISION_LABEL[d.row.decision as keyof typeof DECISION_LABEL] ?? d.row.decision}`, hint: "Keputusan sudah berlaku. Tinjau dasarnya, lalu setujui atau ubah bila perlu.", cta: { href: "#keputusan", label: "Tinjau keputusan" } }
      : { title: `Selesai: ${DECISION_LABEL[d.row.decision as keyof typeof DECISION_LABEL] ?? d.row.decision}`, hint: `Diputus otomatis, lalu ${auto.review_status === "diubah" ? "diubah" : "disetujui"} petugas.` };
  } else if (decided) {
    next = { title: `Selesai: ${DECISION_LABEL[d.row.decision as keyof typeof DECISION_LABEL] ?? d.row.decision}`, hint: `Diputuskan ${fmtDateTime(d.row.decided_at)}.` };
  } else if (autoWaiting) {
    next = { title: "Menunggu jawaban peserta", hint: "Autopilot sudah mengirim pertanyaan ke aplikasi peserta. Kasus diputus otomatis begitu peserta menjawab.", cta: { href: "/m", label: "Buka aplikasi peserta" } };
  } else if (canDecide) {
    next = {
      title: d.row.status === "open" ? "Periksa bukti, lalu minta klarifikasi atau putuskan" : hospitalReplied ? "RS sudah menjawab. Periksa, lalu putuskan" : "Tunggu jawaban RS, atau putuskan bila bukti cukup",
      hint: CHECK_HINT[d.row.modus],
      cta: { href: "#keputusan", label: "Ke keputusan" },
      alt: { href: "#klarifikasi", label: "Buka percakapan" },
    };
  } else if (role === "casemix") {
    next = { title: "Lengkapi bukti dan jawab klarifikasi", hint: CHECK_HINT[d.row.modus], cta: { href: "#klarifikasi", label: "Buka percakapan" } };
  } else {
    next = { title: "Beri catatan indikasi medis", hint: "Tulis di percakapan agar terbaca verifikator.", cta: { href: "#klarifikasi", label: "Buka percakapan" } };
  }

  type Ev = { at: string; label: React.ReactNode; tone: "ink" | "danger" | "ok" };
  const events: Ev[] = ([
    {
      at: d.episode.admit_at,
      label: (
        <>
          Masuk {d.episode.kind === "RITL" ? "rawat inap" : "rawat jalan"}: {d.episode.dx_text} <span className="text-muted">(<CodeTag k="diagnosis">{d.episode.dx_code}</CodeTag>)</span>
        </>
      ),
      tone: "ink",
    },
    ...d.services.filter((s) => s.service.code !== "KMR").map((s) => ({
      at: s.service.performed_at,
      label: `${s.service.name} (${s.service.performer})`,
      tone: s.check.state === "tersedia" ? ("ink" as const) : ("danger" as const),
    })),
    { at: d.episode.discharge_at, label: "Pulang", tone: "ink" },
    ...(d.claim.submitted_at ? [{ at: d.claim.submitted_at, label: <>Klaim <CodeTag k="klaim">{d.claim.claim_no}</CodeTag> diajukan</>, tone: "ink" as const }] : []),
    ...(d.claim.paid_at ? [{ at: d.claim.paid_at, label: `Klaim dibayar ${rupiah(d.claim.amount)}`, tone: "ok" as const }] : []),
  ] as Ev[]).sort((a, b) => a.at.localeCompare(b.at));

  const assignedTo = d.row.assignee_role ? ROLE_LABEL[d.row.assignee_role as Role] : "Belum ada penanggung jawab";

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Antrean kasus", href: "/console" }, { label: d.row.id }]}
        title={d.participant.name}
        purpose={`Dirawat di ${d.claim.hospital.replace(/ \(simulasi\)/i, "")}`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <ModusBadge modus={d.row.modus} plain explain icon />
          <CaseStatusBadge status={d.row.status} />
        </div>
      </PageHeader>

      {/* 1. Ringkasan: apa yang ditandai, seberapa yakin, apa langkahnya */}
      <section aria-label="Ringkasan temuan" className="mb-6 overflow-hidden rounded-xl border border-line bg-card">
        <div className="grid lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="min-w-0 p-6 md:p-8">
            <p className="eyebrow text-muted">Yang ditemukan SEHATI</p>
            <h2 className="mt-2 text-3xl font-semibold leading-tight tracking-tight md:text-[2.5rem]">
              <em>Diduga</em> {em}
            </h2>
            <p className="mt-3 max-w-xl text-base leading-relaxed text-ink-soft">
              {WHAT[d.row.modus](d.participant.name, d.claim.hospital.replace(/ \(simulasi\)/i, ""))}
            </p>
            <p className="mt-2 max-w-xl text-xs leading-relaxed text-muted">
              <Term k={plain.term}>{plain.tech}</Term>: {plain.hint} Catatan mesin: <RichCodes text={d.row.summary} serviceCodes={d.services.map((x) => x.service.code)} />
            </p>
            <div className="mt-6 border-t border-line pt-5">
              <ScoreMeter score={d.row.score} />
              <details className="group mt-3 text-sm">
                <summary className="inline-flex cursor-pointer select-none list-none items-center gap-1 text-xs font-medium text-ink-soft underline-offset-4 hover:text-ink hover:underline [&::-webkit-details-marker]:hidden">
                  <span className="transition-transform duration-150 group-open:rotate-90" aria-hidden>›</span> Kenapa skornya segini? <InfoDot k="dasarSkor" />
                </summary>
                <ul className="mt-2 max-w-md space-y-1.5">
                  {d.finding.signals.map((s) => (
                    <li key={s.key} className="flex items-start justify-between gap-3">
                      <span>{s.label}</span>
                      <span className={`shrink-0 text-xs font-semibold tabular-nums ${s.weight < 0 ? "text-ok" : "text-danger"}`}>
                        {s.weight > 0 ? "+" : ""}
                        {s.weight}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            </div>
            <p className="mt-5 flex items-start gap-2.5 rounded-lg border border-line bg-paper px-3.5 py-3 text-sm text-ink-soft" title={d.finding.limit_text}>
              <IconFlag width={16} height={16} className="mt-0.5 shrink-0 text-muted" />
              <span>
                <strong className="font-semibold text-ink">
                  <Term k="batas">Batas kesimpulan</Term>:
                </strong>{" "}
                {LIMIT_SHORT[d.row.modus]}
              </span>
            </p>
          </div>

          <div className="flex flex-col border-t border-line bg-paper p-6 md:p-8 lg:border-l lg:border-t-0">
            <p className="eyebrow text-muted">Langkah berikutnya</p>
            <p className="mt-2 text-xl font-semibold leading-snug tracking-tight">{next.title}</p>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">{next.hint}</p>
            {next.cta && (
              <div className="mt-auto flex flex-wrap items-center gap-x-5 gap-y-2 pt-6">
                <a href={next.cta.href} className="btn-gold inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold">
                  {next.cta.label} <IconArrow width={16} height={16} />
                </a>
                {next.alt && (
                  <a href={next.alt.href} className="text-sm font-medium text-ink-soft underline underline-offset-4 hover:text-ink">
                    {next.alt.label}
                  </a>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-line p-6 md:px-8">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-5 lg:grid-cols-4">
            <Fact label="Nilai klaim" info="nilaiKlaim">
              <span className="block text-lg font-semibold tabular-nums">{rupiah(d.claim.amount)}</span>
              <ClaimStatusBadge status={d.claim.status} />
            </Fact>
            <Fact label="Tenggat" info="tenggat">
              <DueLabel dueAt={d.row.due_at} now={seedNow} decided={decided} />
            </Fact>
            <Fact label="Perawatan (episode)" info="episode">
              <span className="block truncate font-medium" title={d.episode.dx_text}>{d.episode.dx_text}</span>
              <span className="block text-xs text-muted">{fmtDate(d.episode.admit_at)} – {fmtDate(d.episode.discharge_at)}</span>
            </Fact>
            <Fact label="Ditangani oleh" info="penugasan">
              <span className="block font-medium">{assignedTo}</span>
              {d.row.assignee_note && <span className="block truncate text-xs text-muted" title={d.row.assignee_note}>{d.row.assignee_note}</span>}
            </Fact>
          </dl>
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-line pt-4 text-xs text-muted">
            <span className="eyebrow text-[10px]">Nomor arsip</span>
            <span className="inline-flex items-center gap-1">Kasus <CodeTag k="kasus">{d.row.id}</CodeTag></span>
            <span className="inline-flex items-center gap-1">Klaim <CodeTag k="klaim">{d.claim.claim_no}</CodeTag></span>
            <span className="inline-flex items-center gap-1">Peserta <CodeTag k="peserta">{d.participant.id}</CodeTag></span>
          </div>
        </div>
      </section>

      <PageGuide
        id="kasus"
        intro={
          <>
            Ini <strong>satu kasus</strong>: satu klaim rumah sakit yang ditandai SEHATI. Kartu hijau tua di bawah merangkum temuannya. Bagian di bawahnya memperlihatkan buktinya sehingga Anda bisa menilai sendiri sebelum memutuskan.
          </>
        }
        steps={[
          { title: "Baca ringkasan", body: <>Kartu gelap menyatakan apa yang ditemukan, seberapa kuat tandanya (<Term k="skor">skor</Term>), dan <Term k="batas">batas kesimpulan</Term> yang tidak boleh dilampaui.</> },
          { title: "Cocokkan dengan bukti", body: <>Di &quot;Tagihan dan bukti&quot;, tiap layanan yang ditagih dibandingkan dengan <Term k="bukti">dokumen</Term> dan <Term k="konfirmasi">jawaban pasien</Term>. Baris berwarna kuning perlu perhatian.</> },
          { title: "Tanya rumah sakit", body: <>Bila bukti kurang, kirim pesan di <Term k="klarifikasi">Klarifikasi</Term>. Rumah sakit menjawab di tempat yang sama.</> },
          { title: "Putuskan", body: <>Pilih salah satu dari <Term k="keputusan">empat keputusan</Term> dan tulis alasannya. Hanya Verifikator dan Auditor yang bisa memutuskan.</> },
        ]}
        legend={<>Sedang berperan sebagai <strong>{ROLE_LABEL[role]}</strong>. Ganti peran di pojok kanan atas untuk melihat bagaimana halaman ini berubah.</>}
      />

      <div className="grid gap-5 min-[1360px]:grid-cols-[minmax(0,1fr)_390px]">
        <div className="min-w-0 space-y-5">
          {/* 2. Bukti berdampingan */}
          <Card className="overflow-clip">
            <div className="border-b border-line p-4 md:p-5">
              <SectionTitle title="Tagihan dan bukti" hint={<>Setiap layanan yang ditagihkan, dicocokkan dengan dokumen dan jawaban pasien. Bukti kurang <strong>belum berarti</strong> tidak dilakukan.</>} />
              <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="text-lg font-semibold">{rupiah(totalAmount)}</span>
                {lacking > 0 ? (
                  <span className="rounded-full bg-warn-soft px-2.5 py-0.5 text-xs font-bold text-warn">{lacking} dari {d.services.length} layanan belum berbukti lengkap</span>
                ) : (
                  <span className="rounded-full bg-ok-soft px-2.5 py-0.5 text-xs font-bold text-ok">semua layanan berbukti</span>
                )}
              </p>
            </div>
            <div className="hidden grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_minmax(0,1fr)] gap-4 border-b border-line bg-paper/70 px-5 py-2.5 text-xs font-semibold text-ink-soft md:grid">
              <span>Yang ditagihkan</span>
              <span className="flex items-center gap-1">Bukti pelaksanaan <InfoDot k="bukti" /></span>
              <span className="flex items-center gap-1">Jawaban pasien <InfoDot k="konfirmasi" /></span>
            </div>
            <ul>
              {d.services.map((s) => (
                <li
                  key={s.service.id}
                  className={`grid gap-x-4 gap-y-2 border-b border-line/70 px-5 py-3.5 last:border-0 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_minmax(0,1fr)] ${s.check.state !== "tersedia" ? "bg-warn-soft/30 shadow-[inset_4px_0_0_var(--accent)]" : ""}`}
                >
                  <div className="min-w-0">
                    <p className="text-[15px] font-bold leading-snug">{s.service.name}</p>
                    <p className="mt-0.5 text-sm font-semibold tabular-nums">
                      {rupiah(s.service.amount)} <span className="font-normal text-muted">· {s.service.qty}×</span>
                    </p>
                    <p className="text-xs text-muted">{fmtDateTime(s.service.performed_at)} · {s.service.performer}</p>
                    <p className="mt-1 text-[11px] text-muted">
                      Kode layanan <CodeTag k="layanan">{s.service.code}</CodeTag>
                    </p>
                  </div>
                  <div className="min-w-0 text-sm">
                    <p className="mb-1 text-xs font-semibold text-muted md:hidden">Bukti pelaksanaan</p>
                    <EvidenceBadge state={s.check.state} />
                    {s.check.reasons.map((r, i) => (
                      <p key={i} className="mt-1 text-xs text-ink-soft">{r}</p>
                    ))}
                    {s.evidence.map((e) => (
                      <p key={e.id} className="border border-line bg-paper mt-1 rounded-lg px-2 py-1 text-xs">{e.summary}</p>
                    ))}
                  </div>
                  <div className="min-w-0 text-xs">
                    <p className="mb-1 text-xs font-semibold text-muted md:hidden">Jawaban pasien</p>
                    {s.confirmations.length === 0 ? (
                      <span className="text-muted">Pasien belum menjawab</span>
                    ) : (
                      s.confirmations.map((c) => (
                        <p key={c.id} className={`font-semibold ${ANSWER_CLS[c.answer]}`}>
                          {ANSWER_LABEL[c.answer]}
                          {c.note && <span className="block break-words font-normal text-ink-soft">“{c.note}”</span>}
                        </p>
                      ))
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {d.generalEvidence.length > 0 && (
              <div className="border-t border-line p-4 text-xs text-ink-soft md:px-5">
                <p className="mb-1 font-semibold text-muted">Dokumen untuk seluruh perawatan</p>
                {d.generalEvidence.map((e) => (
                  <p key={e.id}>{e.summary}</p>
                ))}
              </div>
            )}
          </Card>

          {d.related && (
            <Card className="p-4 md:p-5">
              <SectionTitle title="Klaim pembanding" info="klaimPembanding" hint="Klaim lain yang mirip. Dipakai untuk menilai apakah benar ada penagihan ganda atau pemecahan." />
              <div className="border border-line bg-paper mt-3 rounded-xl p-3">
                <p className="flex flex-wrap items-center gap-2 text-sm">
                  <CodeTag k="klaim">{d.related.claim.claim_no}</CodeTag> <ClaimStatusBadge status={d.related.claim.status} />
                  <strong className="tabular-nums">{rupiah(d.related.claim.amount)}</strong>
                </p>
                <p className="mt-1 text-sm text-ink-soft">
                  {d.related.episode.dx_text} · {fmtDate(d.related.episode.admit_at)} – {fmtDate(d.related.episode.discharge_at)}
                  {d.related.claim.paid_at && ` · dibayar ${fmtDate(d.related.claim.paid_at)}`}
                </p>
              </div>
            </Card>
          )}

          {/* 3. Enam tahap */}
          <section aria-labelledby="tahap" className="space-y-3">
            <SectionTitle id="tahap" title="Enam tahap pemeriksaan" info="tahap" hint="Setiap klaim melewati enam pemeriksaan berurutan, dari kepesertaan sampai audit. Warna menunjukkan hasil tiap tahap." />
            <StageLegend />
            <StageStepper stages={d.stages} />
          </section>

          {/* 4. Garis waktu */}
          <Card className="p-4 md:p-5">
            <SectionTitle title="Garis waktu perawatan" hint="Urutan kejadian dari masuk sampai klaim dibayar. Titik merah = layanan yang belum berbukti." />
            <ol className="relative mt-4 space-y-3 border-l-2 border-line pl-5">
              {events.map((e, i) => (
                <li key={i} className="relative">
                  <span className={`absolute -left-[27px] top-1.5 h-3 w-3 rounded-full shadow-[0_0_0_3px_var(--card)] ${e.tone === "danger" ? "bg-danger" : e.tone === "ok" ? "bg-ok" : "bg-brand"}`} aria-hidden />
                  <p className="text-xs tabular-nums text-muted">{fmtDateTime(e.at)}</p>
                  <p className={`text-sm ${e.tone === "danger" ? "font-semibold text-danger" : ""}`}>{e.label}</p>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        {/* 5. Tindakan: keputusan terdok di atas, lalu diskusi */}
        <aside className="min-w-0 space-y-5">
          <section id="keputusan" aria-labelledby="h-keputusan" className="scroll-mt-24">
            <Card elevated className="overflow-hidden border-t-[3px] border-t-brand p-4 md:p-5">
              <SectionTitle id="h-keputusan" title="Keputusan" info="keputusan" hint={decided ? undefined : "Pilih satu, tulis alasannya, lalu tinjau sebelum dicatat."} />
              <div className="mt-3">
                {autoDecided && auto ? (
                  <AutoDecisionCard
                    caseId={d.row.id}
                    canReview={canDecide}
                    claimAmount={d.claim.amount}
                    roleLabel={ROLE_LABEL[role]}
                    auto={{
                      ...auto,
                      reviewedByLabel: auto.reviewed_by ? ROLE_LABEL[auto.reviewed_by as Role] ?? auto.reviewed_by : null,
                      reviewedAtLabel: auto.reviewed_at ? fmtDateTime(auto.reviewed_at) : null,
                    }}
                  />
                ) : decided ? (
                  <div className="rounded-xl bg-ok-soft p-3 text-sm ring-1 ring-ok/20">
                    <p className="font-bold text-ok">{DECISION_LABEL[d.row.decision as keyof typeof DECISION_LABEL] ?? d.row.decision}</p>
                    <p className="mt-1 break-words">{d.row.decision_reason}</p>
                    {d.row.correction_amount ? <p className="mt-1 text-xs font-semibold">Koreksi {rupiah(d.row.correction_amount)}</p> : null}
                    <p className="mt-1 text-xs text-ink-soft">{fmtDateTime(d.row.decided_at)}</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {autoWaiting && auto && <AutoWaitingCard summary={auto.summary} at={auto.at} />}
                    {suggestion && <AutoSuggestion caseId={d.row.id} verdict={suggestion} canDecide={canDecide} />}
                    <DecisionForm
                      caseId={d.row.id}
                      disabled={!canDecide}
                      disabledReason={canDecide ? undefined : `Hanya Verifikator atau Auditor yang dapat memutuskan. Anda masuk sebagai ${ROLE_LABEL[role]}.`}
                      roleLabel={ROLE_LABEL[role]}
                      claimAmount={d.claim.amount}
                    />
                  </div>
                )}
              </div>
            </Card>
          </section>

          <Card className="scroll-mt-24 p-4 md:p-5">
            <SectionTitle id="klarifikasi" title="Klarifikasi" info="klarifikasi" hint="Tanya jawab dengan rumah sakit untuk kasus ini." />
            <div className="my-3">
              <MessageThread
                messages={d.messages.map((m) => ({ id: m.id, who: ROLE_LABEL[m.role as Role] ?? m.role, at: fmtDateTime(m.at), text: m.text, mine: m.role === role }))}
              />
            </div>
            <MessageForm
              caseId={d.row.id}
              disabled={decided}
              disabledReason={decided ? "Kasus selesai, percakapan ditutup." : undefined}
              roleLabel={ROLE_LABEL[role]}
            />
          </Card>

          <Card className="p-4 md:p-5">
            <SectionTitle title="Penugasan" info="penugasan" hint="Tentukan siapa yang menangani kasus ini berikutnya." />
            <div className="mt-3">
              <AssignForm
                caseId={d.row.id}
                current={d.row.assignee_role}
                options={(["casemix", "verifikator", "auditor", "dokter"] as Role[]).map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
                disabled={decided || role === "dokter"}
                disabledReason={decided ? "Kasus selesai." : role === "dokter" ? "Dokter tidak dapat menugaskan kasus." : undefined}
              />
            </div>
          </Card>

          {d.siblings.length > 0 && (
            <Card className="p-4 md:p-5">
              <SectionTitle title="Kasus lain pada peserta ini" hint="Pasien yang sama punya kasus lain. Lihat apakah polanya berulang." />
              <ul className="mt-3 space-y-2 text-sm">
                {d.siblings.map((s) => (
                  <li key={s.id}>
                    <Link href={`/console/cases/${s.id}`} className="group flex flex-wrap items-center gap-2 rounded-lg border border-line bg-card px-3 py-2 transition-colors hover:bg-paper">
                      <ModusBadge modus={s.modus} plain icon />
                      <span className="text-xs text-muted">Nomor {s.id}</span>
                      <IconArrow width={14} height={14} className="ml-auto text-brand transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card className="p-4 md:p-5">
            <SectionTitle title="Riwayat kasus" hint="Siapa melakukan apa, kapan. Tercatat otomatis." />
            <ul className="relative mt-3 space-y-2.5 border-l-2 border-line pl-4 text-xs">
              {d.audit.map((a) => (
                <li key={a.id} className="relative">
                  <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-brand ring-2 ring-card" aria-hidden />
                  <span className="block tabular-nums text-muted">{fmtDateTime(a.ts)}</span>
                  <strong>{ROLE_LABEL[a.actor as Role] ?? (a.actor === "sistem" ? "Sistem" : a.actor === "peserta" ? "Peserta" : a.actor)}</strong> {AUDIT_LABEL[a.action] ?? a.action.replaceAll("_", " ")}
                </li>
              ))}
            </ul>
            <Link href="/console/audit" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand underline-offset-4 hover:underline">Jejak audit lengkap <IconArrow width={13} height={13} /></Link>
          </Card>
        </aside>
      </div>
    </>
  );
}
