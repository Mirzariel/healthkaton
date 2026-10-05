import type { Metadata } from "next";
import Link from "next/link";
import { CodeTag, InfoDot, PageGuide, Term } from "@/components/explain";
import { AutopilotControl } from "@/components/console/Autopilot";
import { IconAlert, IconArrow, IconCheckCircle, IconCoins, IconInbox, IconSearch } from "@/components/console/icons";
import { CountUp, MotionItem, MotionRow } from "@/components/motion";
import { Card, CaseStatusBadge, DueLabel, EmptyState, MODUS_PLAIN, ModusBadge, PageBanner, RiskMeter, Stat } from "@/components/ui";
import { ROLE_LABEL } from "@/lib/actions";
import { rupiah, ts } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { getAutoStats } from "@/lib/autopilot";
import { getSeedNow, getStats, listCases, type CaseRow } from "@/lib/queries";
import { getRole } from "@/lib/server";
import type { Modus, Role } from "@/lib/types";

export const metadata: Metadata = { title: "Antrean kasus · SEHATI" };

type SP = Promise<{ [k: string]: string | string[] | undefined }>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

const MODUS_CHIPS: { value: Modus; label: string }[] = (["phantom", "repeat_billing", "fragmentation"] as Modus[]).map((m) => ({ value: m, label: MODUS_PLAIN[m].short }));
const SEV = { high: 0, medium: 1, low: 2 } as const;

function Chip({ href, active, count, children }: { href: string; active: boolean; count?: number; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "true" : undefined}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-150 ${
        active ? "bg-ink text-white" : "border border-line bg-card text-ink-soft hover:border-ink/30 hover:text-ink"
      }`}
    >
      {children}
      {count !== undefined && (
        <span className={`rounded-full px-1.5 text-xs tabular-nums ${active ? "bg-white/20" : "bg-line text-ink-soft"}`}>{count}</span>
      )}
    </Link>
  );
}

function Assignee({ c }: { c: CaseRow }) {
  return c.assignee_role ? (
    <span className="mt-1 block text-xs text-muted">Ditangani: {ROLE_LABEL[c.assignee_role as Role] ?? c.assignee_role}</span>
  ) : (
    <span className="mt-1 block text-xs text-muted">Belum ada penanggung jawab</span>
  );
}

/** Kode arsip (nomor kasus & klaim): kecil, redup, dan bisa ditanyakan artinya. Dibungkus z-10 agar tetap bisa diklik di atas tautan baris. */
function Codes({ c }: { c: CaseRow }) {
  return (
    <p className="relative z-10 mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted">
      <span className="inline-flex items-center gap-1">
        Kasus <CodeTag k="kasus">{c.id}</CodeTag>
      </span>
      <span className="inline-flex items-center gap-1">
        Klaim <CodeTag k="klaim">{c.claim_no}</CodeTag>
      </span>
    </p>
  );
}

export default async function Dashboard({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const status = ["active", "overdue", "decided", "all"].includes(one(sp.status)) ? one(sp.status) : "active";
  const modus = MODUS_CHIPS.some((m) => m.value === one(sp.modus)) ? (one(sp.modus) as Modus) : "";
  const q = one(sp.q).slice(0, 80);
  const db = getDb();
  const stats = getStats(db);
  const auto = getAutoStats(db);
  const role = await getRole();
  const seedNow = getSeedNow(db);
  const now = ts(seedNow);

  const everything = listCases(db, { q: q || undefined });
  const isOverdue = (c: CaseRow) => c.status !== "decided" && ts(c.due_at) < now;
  const byStatus = (c: CaseRow) =>
    status === "all" ? true : status === "decided" ? c.status === "decided" : status === "overdue" ? isOverdue(c) : c.status !== "decided";
  const statusCount = {
    active: everything.filter((c) => c.status !== "decided").length,
    overdue: everything.filter(isOverdue).length,
    decided: everything.filter((c) => c.status === "decided").length,
    all: everything.length,
  };
  const inStatus = everything.filter(byStatus);
  const modusCount = (m: Modus) => inStatus.filter((c) => c.modus === m).length;
  const rows = inStatus
    .filter((c) => !modus || c.modus === modus)
    .sort(
      (a, b) =>
        Number(a.status === "decided") - Number(b.status === "decided") ||
        Number(isOverdue(b)) - Number(isOverdue(a)) ||
        SEV[a.severity] - SEV[b.severity] ||
        b.score - a.score ||
        a.due_at.localeCompare(b.due_at),
    );

  const href = (over: Record<string, string>) => {
    const p = new URLSearchParams({ status, modus, q, ...over });
    for (const [k, v] of [...p.entries()]) if (!v || (k === "status" && v === "active")) p.delete(k);
    const s = p.toString();
    return s ? `/console?${s}` : "/console";
  };
  const filtered = status !== "active" || !!modus || !!q;
  const SHOW = 100;
  const shown = rows.slice(0, SHOW);

  return (
    <>
      <PageBanner
        eyebrow="Mulai dari sini"
        title="Antrean kasus"
        purpose="Daftar klaim rumah sakit yang ditandai SEHATI karena tampak janggal. Periksa dari baris paling atas: yang paling mendesak sudah diurutkan untuk Anda."
      />

      <AutopilotControl stats={auto} canControl={role === "verifikator" || role === "auditor"} />

      <PageGuide
        id="antrean"
        intro={
          <>
            Halaman ini adalah <strong>daftar kerja Anda</strong>. SEHATI membaca klaim rumah sakit dan menandai yang tampak janggal. Petugas lalu memeriksa buktinya, bertanya ke rumah sakit bila perlu, dan memutuskan. Tanda dari SEHATI selalu berupa <strong>dugaan</strong>, bukan vonis.
          </>
        }
        steps={[
          {
            title: "Baca dugaannya",
            body: (
              <>
                Tiap baris menyebut nama pasien, penyakitnya, dan dugaan dalam bahasa biasa, misalnya <Term k="phantom">tagihan fiktif</Term>, <Term k="repeat_billing">tagihan ganda</Term>, atau <Term k="fragmentation">perawatan dipecah</Term>.
              </>
            ),
          },
          {
            title: "Lihat seberapa mendesak",
            body: (
              <>
                Meter <Term k="risiko">risiko</Term> (Tinggi/Sedang/Rendah) dan <Term k="tenggat">tenggat</Term> menunjukkan prioritas. Tanggal merah berarti sudah lewat batas. Daftar sudah diurutkan otomatis.
              </>
            ),
          },
          {
            title: "Buka kasusnya",
            body: "Klik baris mana saja. Anda akan melihat apa yang ditemukan, buktinya, dan satu langkah berikutnya yang disarankan.",
          },
          {
            title: "Abaikan kode bila tak perlu",
            body: (
              <>
                <CodeTag k="kasus">KS-0003</CodeTag> dan <CodeTag k="klaim">KLM-2026-001777</CodeTag> hanya nomor arsip untuk mencari berkas. Klik ikon (i) bila ingin tahu artinya.
              </>
            ),
          },
        ]}
        legend={
          <>
            <strong>Status kasus:</strong> <span className="font-semibold text-warn">Baru</span> belum ditinjau ·{" "}
            <span className="font-semibold text-info">Menunggu RS</span> sudah diminta klarifikasi ·{" "}
            <span className="font-semibold text-ok">Selesai</span> sudah diputuskan.
          </>
        }
      />

      <section aria-label="Ringkasan" className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Perlu ditindak" info="statusKasus" icon={<IconInbox width={18} height={18} />} value={<CountUp value={stats.open + stats.clarification} />} hint={`kasus · ${stats.open} baru, ${stats.clarification} menunggu RS`} tone="warn" href={href({ status: "active", modus: "", q: "" })} />
        <Stat label="Lewat tenggat" info="tenggat" icon={<IconAlert width={18} height={18} />} value={<CountUp value={stats.overdue} />} hint={stats.overdue ? "kasus · periksa dulu" : "kasus · tidak ada"} tone={stats.overdue ? "danger" : "ok"} href={href({ status: "overdue", modus: "", q: "" })} />
        <Stat label="Nilai klaim berisiko" info="nilaiKlaim" icon={<IconCoins width={18} height={18} />} value={<CountUp value={stats.amountAtRisk} kind="rpShort" />} hint="pada kasus yang masih aktif" tone="danger" />
        <Stat
          label="Kasus selesai"
          icon={<IconCheckCircle width={18} height={18} />}
          value={<CountUp value={stats.resolutionRate} kind="pct" />}
          hint={stats.avgDecisionH ? `rata-rata ${(stats.avgDecisionH / 24).toFixed(1).replace(".", ",")} hari per keputusan` : "dari seluruh kasus"}
          tone="ok"
          href={href({ status: "decided", modus: "", q: "" })}
        />
      </section>

      <section aria-label="Saring daftar" className="mb-4 space-y-3 rounded-xl border border-line bg-card p-4">
        <div className="flex flex-wrap items-start gap-x-8 gap-y-3">
          <div>
            <p className="mb-1.5 text-xs font-semibold text-ink-soft">Tampilkan kasus</p>
            <div className="flex flex-wrap items-center gap-2">
              <Chip href={href({ status: "active" })} active={status === "active"} count={statusCount.active}>Aktif</Chip>
              <Chip href={href({ status: "overdue" })} active={status === "overdue"} count={statusCount.overdue}>Lewat tenggat</Chip>
              <Chip href={href({ status: "decided" })} active={status === "decided"} count={statusCount.decided}>Selesai</Chip>
              <Chip href={href({ status: "all" })} active={status === "all"} count={statusCount.all}>Semua</Chip>
            </div>
          </div>
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-ink-soft">
              Jenis dugaan <InfoDot k="jenisDugaan" />
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Chip href={href({ modus: "" })} active={!modus}>Semua</Chip>
              {MODUS_CHIPS.map((m) => (
                <Chip key={m.value} href={href({ modus: m.value })} active={modus === m.value} count={modusCount(m.value)}>
                  {m.label}
                </Chip>
              ))}
            </div>
          </div>
        </div>
        <form action="/console" role="search" className="flex flex-wrap items-end gap-2 border-t border-line pt-3">
          {status !== "active" && <input type="hidden" name="status" value={status} />}
          {modus && <input type="hidden" name="modus" value={modus} />}
          <div className="min-w-0 flex-1 basis-64 sm:max-w-md">
            <label htmlFor="q" className="mb-1 block text-xs font-semibold text-ink-soft">Cari pasien atau nomor</label>
            <div className="relative">
              <IconSearch width={16} height={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                id="q"
                name="q"
                type="search"
                defaultValue={q}
                placeholder="Nama pasien, nomor klaim, atau nomor kasus"
                className="border border-line bg-paper w-full rounded-lg py-2 pl-9 pr-3 text-sm transition-shadow focus-visible:border-brand"
              />
            </div>
          </div>
          <button className="btn-depth rounded-lg px-5 py-2 text-sm font-bold text-white">Cari</button>
          {filtered && (
            <Link href="/console" className="py-2 text-sm font-semibold text-brand underline-offset-4 hover:underline">
              Hapus filter
            </Link>
          )}
        </form>
      </section>

      <p className="mb-2 text-xs text-muted" aria-live="polite">
        <strong className="font-semibold text-ink-soft">{rows.length} kasus</strong> · diurutkan: lewat tenggat dulu, lalu risiko tertinggi
      </p>

      {rows.length === 0 ? (
        <Card className="overflow-clip">
          <EmptyState photo="clinician" title={status === "active" && !modus && !q ? "Semua kasus aktif sudah ditangani" : "Tidak ada kasus yang cocok"}>
            {filtered ? (
              <Link href="/console" className="font-semibold text-brand underline-offset-4 hover:underline">
                Hapus filter dan tampilkan antrean aktif
              </Link>
            ) : (
              "Kasus baru muncul di sini setelah data klaim diimpor."
            )}
          </EmptyState>
        </Card>
      ) : (
        <>
          {/* Layar lebar: tabel */}
          <Card className="hidden overflow-clip md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="sticky top-[var(--console-head,72px)] z-10 border-b border-line bg-card text-left text-xs font-medium text-ink-soft">
                  <th scope="col" className="px-4 py-3">Risiko <InfoDot k="risiko" /></th>
                  <th scope="col" className="px-3 py-3">Dugaan dan pasien <InfoDot k="jenisDugaan" /></th>
                  <th scope="col" className="px-3 py-3">Status <InfoDot k="statusKasus" /></th>
                  <th scope="col" className="px-3 py-3">Tenggat <InfoDot k="tenggat" /></th>
                  <th scope="col" className="px-3 py-3 text-right">Nilai klaim <InfoDot k="nilaiKlaim" /></th>
                  <th scope="col" className="w-24 px-3 py-3"><span className="sr-only">Buka kasus</span></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((c, i) => {
                  const open = c.status !== "decided";
                  const bar = open && c.severity === "high" ? "shadow-[inset_4px_0_0_var(--danger)]" : open && c.severity === "medium" ? "shadow-[inset_4px_0_0_var(--accent)]" : "";
                  const m = MODUS_PLAIN[c.modus];
                  return (
                    <MotionRow key={c.id} index={i} className="group relative border-b border-line/70 bg-card transition-colors duration-150 last:border-0 hover:bg-paper">
                      <td className={`px-4 py-3.5 ${bar}`}><RiskMeter severity={c.severity} score={c.score} muted={!open} /></td>
                      <td className="max-w-[340px] px-3 py-3.5">
                        <Link href={`/console/cases/${c.id}`} className="block truncate text-[15px] font-bold after:absolute after:inset-0 after:content-[''] focus-visible:after:rounded-lg" title={c.participant_name}>
                          {c.participant_name}
                        </Link>
                        <p className="truncate text-xs text-ink-soft" title={c.dx_text}>Dirawat: {c.dx_text}</p>
                        <p className="relative z-10 mt-1.5 flex flex-wrap items-center gap-1.5">
                          <ModusBadge modus={c.modus} plain explain icon />
                        </p>
                        <p className="mt-1 line-clamp-1 text-xs text-muted" title={m.hint}>{m.hint}</p>
                        <Codes c={c} />
                      </td>
                      <td className="px-3 py-3.5"><CaseStatusBadge status={c.status} /><Assignee c={c} /></td>
                      <td className="whitespace-nowrap px-3 py-3.5 text-xs"><DueLabel dueAt={c.due_at} now={seedNow} decided={c.status === "decided"} /></td>
                      <td className="whitespace-nowrap px-3 py-3.5 text-right font-semibold tabular-nums">{rupiah(c.amount)}</td>
                      <td className="px-3 py-3.5 text-right" aria-hidden>
                        <span className="inline-flex items-center gap-1 rounded-md border border-line px-2.5 py-1 text-xs font-semibold text-ink-soft transition-colors duration-150 group-hover:border-ink group-hover:bg-ink group-hover:text-white">
                          Buka <IconArrow width={13} height={13} className="transition-transform group-hover:translate-x-0.5" />
                        </span>
                      </td>
                    </MotionRow>
                  );
                })}
              </tbody>
            </table>
          </Card>

          {/* Ponsel: kartu */}
          <ul className="space-y-2.5 md:hidden">
            {shown.map((c, i) => {
              const open = c.status !== "decided";
              const edge = open && c.severity === "high" ? "border-l-[4px] border-l-danger" : open && c.severity === "medium" ? "border-l-[4px] border-l-accent" : "";
              return (
                <li key={c.id}>
                  <MotionItem index={i} className={`border border-line bg-card group relative rounded-xl p-3.5 active:bg-brand-soft ${edge}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link href={`/console/cases/${c.id}`} className="block truncate text-base font-bold after:absolute after:inset-0 after:rounded-xl after:content-['']" title={c.participant_name}>
                          {c.participant_name}
                        </Link>
                        <p className="truncate text-xs text-ink-soft">Dirawat: {c.dx_text}</p>
                      </div>
                      <RiskMeter severity={c.severity} score={c.score} muted={!open} />
                    </div>
                    <div className="relative z-10 mt-2 flex flex-wrap items-center gap-1.5">
                      <ModusBadge modus={c.modus} plain explain icon />
                      <CaseStatusBadge status={c.status} />
                    </div>
                    <div className="mt-2.5 flex items-end justify-between gap-2 text-xs">
                      <DueLabel dueAt={c.due_at} now={seedNow} decided={c.status === "decided"} />
                      <span className="font-bold tabular-nums">{rupiah(c.amount)}</span>
                    </div>
                    <Codes c={c} />
                    <p className="mt-2 flex items-center justify-end gap-1 text-xs font-bold text-brand" aria-hidden>Buka kasus <IconArrow width={13} height={13} /></p>
                  </MotionItem>
                </li>
              );
            })}
          </ul>
          {rows.length > SHOW && (
            <p className="mt-2 text-xs text-muted">Menampilkan {SHOW} dari {rows.length} kasus. Persempit dengan filter atau pencarian.</p>
          )}
        </>
      )}
    </>
  );
}
