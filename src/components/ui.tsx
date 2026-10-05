import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { InfoDot, Term } from "@/components/explain";
import { IconCopy, IconGhost, IconSplit } from "@/components/console/icons";
import { dayDiff, fmtDate } from "@/lib/dates";
import type { GlossaryKey } from "@/lib/glossary";
import { ScoreBar, StageDot, StageItem } from "@/components/motion";
import type { EvidenceState, Modus, Role, Stage, StageKey, StageStatus } from "@/lib/types";

/** Apa yang bisa dilakukan tiap peran (sesuai aturan di server). */
export const ROLE_HINT: Record<Role, string> = {
  casemix: "Menjawab klarifikasi, menugaskan",
  verifikator: "Memeriksa dan memutuskan",
  auditor: "Mengaudit dan memutuskan",
  dokter: "Memberi catatan medis",
};

export const MODUS_SHORT: Record<Modus, string> = {
  repeat_billing: "Repeat billing",
  fragmentation: "Pemecahan episode",
  phantom: "Phantom billing",
};
export const MODUS_COLOR: Record<Modus, string> = {
  repeat_billing: "bg-info-soft text-info",
  fragmentation: "bg-warn-soft text-warn",
  phantom: "bg-danger-soft text-danger",
};

/** Bahasa awam untuk tiap jenis dugaan. `headline` dipakai sebagai judul utama; istilah teknis menjadi keterangan kedua. */
export const MODUS_PLAIN: Record<Modus, { headline: string; short: string; tech: string; term: GlossaryKey; hint: string }> = {
  phantom: { headline: "Diduga tagihan fiktif", short: "Tagihan fiktif", tech: "Phantom billing", term: "phantom", hint: "Ada tindakan yang ditagih, tetapi buktinya belum ada." },
  repeat_billing: { headline: "Diduga tagihan ganda", short: "Tagihan ganda", tech: "Repeat billing", term: "repeat_billing", hint: "Perawatan yang sama tampak ditagih lebih dari sekali." },
  fragmentation: { headline: "Diduga perawatan dipecah", short: "Perawatan dipecah", tech: "Pemecahan episode", term: "fragmentation", hint: "Satu rangkaian perawatan tampak dipecah jadi beberapa klaim." },
};
const MODUS_ICON = { phantom: IconGhost, repeat_billing: IconCopy, fragmentation: IconSplit } as const;

/** Kartu: putih, garis rambut. `elevated` hanya menambah bayangan tipis untuk satu elemen terpenting per layar. */
export function Card({ children, className = "", elevated = false }: { children: ReactNode; className?: string; elevated?: boolean }) {
  return <div className={`rounded-xl border border-line bg-card ${elevated ? "shadow-[0_1px_2px_rgb(11_13_12/0.05),0_4px_12px_-6px_rgb(11_13_12/0.08)]" : ""} ${className}`}>{children}</div>;
}

export function Pill({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold ${className}`}>{children}</span>;
}

/** Lencana jenis dugaan. Bawaan: istilah teknis (kompatibel). `plain` = bahasa awam; `explain` = istilah bisa diklik untuk penjelasan. */
export function ModusBadge({ modus, plain = false, explain = false, icon = false }: { modus: Modus; plain?: boolean; explain?: boolean; icon?: boolean }) {
  const m = MODUS_PLAIN[modus];
  const Icon = MODUS_ICON[modus];
  const text = plain ? m.short : MODUS_SHORT[modus];
  return (
    <Pill className={MODUS_COLOR[modus]}>
      {icon && <Icon width={13} height={13} />}
      {explain ? <Term k={m.term}>{text}</Term> : text}
    </Pill>
  );
}

/** Label awam untuk skor 0-100 (ambang sama dengan tingkat risiko: 70 dan 50). */
export function scoreInfo(score: number) {
  if (score >= 70) return { label: "Indikasi kuat", bar: "bg-danger", text: "text-danger", dark: "text-[#ff9aa0]", level: "Tinggi" };
  if (score >= 50) return { label: "Indikasi sedang", bar: "bg-accent", text: "text-warn", dark: "text-accent", level: "Sedang" };
  return { label: "Indikasi lemah", bar: "bg-muted", text: "text-ink-soft", dark: "text-white/80", level: "Rendah" };
}

/** Meter skor besar: angka, kata, dan bilah berzona (lemah | sedang | kuat) supaya "30" langsung terbaca artinya. */
export function ScoreMeter({ score, tone = "light" }: { score: number; tone?: "light" | "dark" }) {
  const i = scoreInfo(score);
  const dark = tone === "dark";
  return (
    <div role="img" aria-label={`Skor ${score} dari 100, ${i.label.toLowerCase()}`}>
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className={`text-4xl font-semibold tabular-nums tracking-tight ${dark ? i.dark : i.text}`}>{score}</span>
        <span className={`text-sm ${dark ? "text-white/70" : "text-muted"}`}>dari 100</span>
        <span className={`text-sm font-semibold ${dark ? i.dark : i.text}`}>{i.label}</span>
        <InfoDot k="skor" className={dark ? "text-white" : "text-ink-soft"} />
      </p>
      <div className={`relative mt-2.5 h-2 w-full max-w-sm overflow-hidden rounded-full ${dark ? "bg-white/10" : "bg-line"}`} aria-hidden>
        <ScoreBar pct={score} className={i.bar} />
        <div className={`absolute inset-y-0 left-[50%] w-px ${dark ? "bg-white/30" : "bg-card"}`} />
        <div className={`absolute inset-y-0 left-[70%] w-px ${dark ? "bg-white/30" : "bg-card"}`} />
      </div>
      <div className={`relative mt-1 hidden h-4 w-full max-w-sm font-mono text-[10px] sm:block ${dark ? "text-white/60" : "text-muted"}`} aria-hidden>
        <span className="absolute left-0">0 lemah</span>
        <span className="absolute left-[50%] -translate-x-1/2">50 sedang</span>
        <span className="absolute right-0">70+ kuat</span>
      </div>
    </div>
  );
}

/** Meter ringkas untuk tabel/kartu: kata risiko + bilah kecil + angka. */
export function RiskMeter({ severity, score, muted = false }: { severity: "low" | "medium" | "high"; score: number; muted?: boolean }) {
  const map = {
    high: { label: "Tinggi", bar: "bg-danger", text: "text-danger" },
    medium: { label: "Sedang", bar: "bg-accent", text: "text-warn" },
    low: { label: "Rendah", bar: "bg-muted", text: "text-ink-soft" },
  } as const;
  const m = map[severity];
  return (
    <div className={`w-[6.5rem] ${muted ? "opacity-60" : ""}`} role="img" aria-label={`Risiko ${m.label.toLowerCase()}, skor ${score} dari 100`}>
      <p className="flex items-baseline justify-between gap-1">
        <span className={`text-sm font-semibold ${m.text}`}>{m.label}</span>
        <span className="text-xs tabular-nums text-muted">{score}<span className="text-[10px]">/100</span></span>
      </p>
      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-line" aria-hidden>
        <div className={`h-full rounded-full ${m.bar}`} style={{ width: `${Math.max(4, Math.min(100, score))}%` }} />
      </div>
    </div>
  );
}

export function SeverityBadge({ severity, score }: { severity: "low" | "medium" | "high"; score?: number }) {
  const map = {
    high: ["bg-danger text-white", "Tinggi"],
    medium: ["bg-accent text-ink", "Sedang"],
    low: ["bg-line text-ink-soft", "Rendah"],
  } as const;
  const [cls, label] = map[severity];
  return (
    <Pill className={cls}>
      {label}
      {score !== undefined && <span className="font-mono opacity-80">{score}</span>}
    </Pill>
  );
}

const CASE_STATUS: Record<string, [string, string, string]> = {
  open: ["bg-warn-soft text-warn", "Baru", "Kasus baru, belum ada yang meninjau."],
  clarification: ["bg-info-soft text-info", "Menunggu RS", "Petugas sudah meminta klarifikasi; menunggu jawaban rumah sakit."],
  decided: ["bg-ok-soft text-ok", "Selesai", "Sudah diputuskan oleh petugas."],
};
export function CaseStatusBadge({ status }: { status: string }) {
  const [cls, label, title] = CASE_STATUS[status] ?? ["bg-line text-ink-soft", status, status];
  return (
    <Pill className={cls}>
      <span title={title}>{label}</span>
    </Pill>
  );
}

export function ClaimStatusBadge({ status }: { status: string }) {
  const map: Record<string, [string, string, string]> = {
    draft: ["bg-line text-ink-soft", "Draft", "Belum dikirim rumah sakit ke BPJS."],
    submitted: ["bg-info-soft text-info", "Diajukan", "Sudah dikirim, menunggu pembayaran."],
    paid: ["bg-ok-soft text-ok", "Dibayar", "Sudah dibayar BPJS."],
  };
  const [cls, label, title] = map[status] ?? ["bg-line text-ink-soft", status, status];
  return (
    <Pill className={cls}>
      <span title={title}>{label}</span>
    </Pill>
  );
}

export function EvidenceBadge({ state }: { state: EvidenceState }) {
  const map: Record<EvidenceState, [string, string, string]> = {
    tersedia: ["bg-ok-soft text-ok", "Bukti tersedia", "✓"],
    kurang: ["bg-warn-soft text-warn", "Bukti kurang", "!"],
    bertentangan: ["bg-danger-soft text-danger", "Bukti bertentangan", "×"],
  };
  const [cls, label, ic] = map[state];
  return (
    <Pill className={cls}>
      <span aria-hidden className="font-bold">{ic}</span>
      {label}
    </Pill>
  );
}

const STAGE_STYLE: Record<StageStatus, { dot: string; text: string; label: string; line: string; card: string }> = {
  ok: { dot: "bg-ok text-white", text: "text-ok", label: "Sesuai", line: "2xl:after:bg-ok/50", card: "" },
  warn: { dot: "bg-accent text-ink", text: "text-warn", label: "Perlu dicek", line: "2xl:after:bg-accent/60", card: "border-t-2 border-t-accent" },
  fail: { dot: "bg-danger text-white", text: "text-danger", label: "Bermasalah", line: "2xl:after:bg-danger/50", card: "border-t-2 border-t-danger" },
  pending: { dot: "bg-line text-ink-soft", text: "text-muted", label: "Menunggu", line: "2xl:after:bg-line", card: "" },
};
const STAGE_ICON: Record<StageStatus, string> = { ok: "✓", warn: "!", fail: "×", pending: "…" };

/** Pertanyaan yang dijawab tiap tahap, dalam bahasa awam. */
export const STAGE_PLAIN: Record<StageKey, string> = {
  kepesertaan: "Apakah pasien peserta aktif saat dirawat?",
  dokumentasi: "Apakah tindakan yang ditagih ada buktinya?",
  koding: "Apakah kode diagnosis & tindakan masuk akal?",
  klaim: "Apakah tagihan disusun dengan benar?",
  verifikasi: "Sudah diperiksa petugas BPJS?",
  audit: "Perlu pemeriksaan lanjutan?",
};

export function StageStepper({ stages }: { stages: Stage[] }) {
  return (
    <ol className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 md:grid-cols-3 2xl:grid-cols-6">
      {stages.map((s, i) => {
        const st = STAGE_STYLE[s.status];
        return (
          <StageItem
            key={s.key}
            index={i}
            className={`relative rounded-xl border border-line bg-card p-3 ${st.card} ${i < stages.length - 1 ? "2xl:after:absolute 2xl:after:left-full 2xl:after:top-[26px] 2xl:after:h-0.5 2xl:after:w-3 2xl:after:content-[''] " + st.line : ""}`}
          >
            <div className="flex items-center gap-2">
              <StageDot key={s.status} status={s.status} index={i} className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${st.dot}`}>
                {STAGE_ICON[s.status]}
              </StageDot>
              <div className="min-w-0">
                <p className="eyebrow text-[10px] text-muted">Tahap {i + 1}</p>
                <p className="truncate text-sm font-semibold">{s.label}</p>
              </div>
            </div>
            <p className="mt-2 text-[11px] leading-snug text-muted">{STAGE_PLAIN[s.key]}</p>
            <p className={`mt-1.5 text-xs font-semibold transition-colors duration-300 ${st.text}`}>{st.label}</p>
            {s.notes.map((n, j) => (
              <p key={j} className="mt-1 text-xs leading-snug text-ink-soft">
                {n}
              </p>
            ))}
          </StageItem>
        );
      })}
    </ol>
  );
}

export const STAGE_STATUS_LABEL = { ok: "Sesuai", warn: "Perlu dicek", fail: "Bermasalah", pending: "Menunggu" } as const;
export const STAGE_STATUS_DOT = { ok: "bg-ok", warn: "bg-accent", fail: "bg-danger", pending: "bg-line" } as const;

/** Legenda status tahap: titik warna + arti singkat. */
export function StageLegend({ className = "" }: { className?: string }) {
  const rows = [
    ["ok", "Sesuai", "tidak ditemukan masalah"],
    ["warn", "Perlu dicek", "ada hal yang perlu dilihat petugas"],
    ["fail", "Bermasalah", "ada ketidaksesuaian jelas"],
    ["pending", "Menunggu", "belum sampai tahap ini"],
  ] as const;
  return (
    <ul className={`flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-ink-soft ${className}`} aria-label="Arti warna tahap">
      {rows.map(([k, l, d]) => (
        <li key={k} className="flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-full ${STAGE_STATUS_DOT[k]}`} aria-hidden />
          <strong className="font-semibold text-ink">{l}</strong> <span className="text-muted">· {d}</span>
        </li>
      ))}
    </ul>
  );
}

/** Dipertahankan agar kompatibel; tidak lagi dipasang di tata letak konsol. */
export function SimBanner() {
  return null;
}

export function PageTitle({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {children}
    </div>
  );
}

export function Breadcrumb({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Jejak halaman" className="no-print mb-3 text-sm text-muted">
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-1.5">
            {i > 0 && <span aria-hidden>/</span>}
            {it.href ? (
              <Link href={it.href} className="font-medium text-ink-soft underline-offset-4 hover:text-ink hover:underline">
                {it.label}
              </Link>
            ) : (
              <span aria-current="page" className="font-mono text-xs font-medium text-ink-soft">{it.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Judul halaman konsol: satu judul, satu kalimat tujuan, satu aksi utama (opsional). */
export function PageHeader({ title, purpose, crumbs, children, eyebrow }: { title: string; purpose?: string; crumbs?: { label: string; href?: string }[]; children?: ReactNode; eyebrow?: string }) {
  return (
    <header className="mb-6">
      {crumbs && <Breadcrumb items={crumbs} />}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          {eyebrow && <p className="eyebrow mb-1.5 text-muted">{eyebrow}</p>}
          <h1 className="text-2xl font-semibold tracking-tight md:text-[1.75rem]">{title}</h1>
          {purpose && <p className="mt-1.5 max-w-2xl text-sm text-ink-soft">{purpose}</p>}
        </div>
        {children}
      </div>
    </header>
  );
}

/** Judul bagian (h2) dengan keterangan satu baris dan ikon penjelas opsional. */
export function SectionTitle({ title, hint, info, id, children }: { title: ReactNode; hint?: ReactNode; info?: GlossaryKey; id?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div className="min-w-0">
        <h2 id={id} className="scroll-mt-24 text-base font-semibold tracking-tight">
          {title} {info && <InfoDot k={info} className="text-ink-soft" />}
        </h2>
        {hint && <p className="mt-0.5 text-sm text-ink-soft">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

/** Tenggat: tanggal + sisa/lewat hari, relatif terhadap "sekarang" simulasi. */
export function DueLabel({ dueAt, now, decided }: { dueAt: string; now: string; decided?: boolean }) {
  if (decided) return <span className="text-ink-soft">{fmtDate(dueAt)}</span>;
  const d = dayDiff(now, dueAt);
  const overdue = d < 0;
  return (
    <span className="block">
      <span className={overdue ? "font-semibold text-danger" : "text-ink"}>{fmtDate(dueAt)}</span>
      <span className={`block text-xs ${overdue ? "font-medium text-danger" : "text-muted"}`}>
        {overdue ? `Lewat ${-d} hari` : d === 0 ? "Hari ini" : `${d} hari lagi`}
      </span>
    </span>
  );
}

const PHOTO = {
  clinician: "/images/clinician-tablet.jpg",
  casemix: "/images/casemix-laptop.jpg",
} as const;

/** Foto hanya sebagai suasana (tanpa wajah, tanpa klaim tentang orang nyata). Tinggi tetap, jadi tidak menggeser tata letak. */
export function Photo({ name, className = "", sizes = "(min-width:1024px) 640px, 100vw" }: { name: keyof typeof PHOTO; className?: string; sizes?: string }) {
  return (
    <div className={`overflow-hidden ${className}`} aria-hidden>
      <Image src={PHOTO[name]} alt="" fill sizes={sizes} className="object-cover" />
    </div>
  );
}

/** Judul halaman pembuka: polos, tanpa foto. Eyebrow mono kecil, judul tegas, satu kalimat tujuan. (`photo` diabaikan; dipertahankan demi kompatibilitas.) */
export function PageBanner({ title, purpose, eyebrow, children }: { title: string; purpose: string; photo?: keyof typeof PHOTO; eyebrow?: string; children?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-2 text-muted">{eyebrow}</p>}
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">{purpose}</p>
      </div>
      {children}
    </header>
  );
}

export function EmptyState({ title, children, photo }: { title: string; children?: ReactNode; photo?: keyof typeof PHOTO }) {
  return (
    <div>
      {photo && (
        <div className="relative h-28">
          <Photo name={photo} className="absolute inset-0" sizes="(min-width:1024px) 900px, 100vw" />
          <div className="absolute inset-0 bg-gradient-to-t from-card via-card/10 to-transparent" aria-hidden />
        </div>
      )}
      <div className="px-4 py-10 text-center">
        <p className="text-lg font-semibold text-ink">{title}</p>
        {children && <div className="mt-2 text-sm text-ink-soft">{children}</div>}
      </div>
    </div>
  );
}

/** Ubin angka (KPI). `info` menambah ikon penjelas di label; `icon` ikon dekoratif di pojok. */
export function Stat({
  label,
  value,
  hint,
  tone = "default",
  href,
  info,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "default" | "danger" | "ok" | "warn";
  href?: string;
  info?: GlossaryKey;
  icon?: ReactNode;
}) {
  const tones = { default: "text-ink", danger: "text-danger", ok: "text-ink", warn: "text-ink" };
  const dots = { default: "bg-line", danger: "bg-danger", ok: "bg-ok", warn: "bg-accent" };
  const shell = `relative block rounded-xl border border-line bg-card p-4`;
  const body = (
    <>
      <div className="relative flex items-start justify-between gap-2">
        <p className="flex items-center gap-2 text-xs font-medium text-ink-soft">
          <span className={`h-1.5 w-1.5 rounded-full ${dots[tone]}`} aria-hidden />
          {href ? (
            <Link href={href} className="after:absolute after:inset-0 after:rounded-xl after:content-['']">
              {label}
            </Link>
          ) : (
            label
          )}
          {info && (
            <span className="relative z-10">
              <InfoDot k={info} />
            </span>
          )}
        </p>
        {icon && <span className="shrink-0 text-muted">{icon}</span>}
      </div>
      <p className={`relative mt-2 text-3xl font-semibold tabular-nums tracking-tight ${tones[tone]}`}>{value}</p>
      {hint && <p className="relative mt-1 text-xs text-muted">{hint}</p>}
    </>
  );
  return <div className={`${shell} ${href ? "transition-colors hover:border-ink/30 has-[a:focus-visible]:outline has-[a:focus-visible]:outline-[3px] has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-accent" : ""}`}>{body}</div>;
}
