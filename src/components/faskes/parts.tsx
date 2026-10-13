import Link from "next/link";
import type { ReactNode } from "react";
import { IconChevronRight, IconClock, IconFile } from "@/components/icons";
import { ProofBadge, StatusPill } from "@/components/ui";
import { CLARIFICATION_LABEL, type Tone } from "@/lib/casework/labels";
import { dayDiff, fmtDate, fmtDateTime } from "@/lib/dates";
import type { ActionStatus, ProofStatus } from "@/lib/labels";
import { ACTION_LABEL } from "@/lib/labels";

/* Potongan tampilan portal faskes. Hanya presentasi: semua data datang dari kueri yang sudah ada. */

const plural = (n: number) => `${n} hari`;

/** Teks tenggat yang tenang: tanggal dan sisa waktu. */
export function dueInfo(status: string, dueAt: string, now: string): { tone: Tone; text: string; soon: boolean } {
  const diff = dayDiff(now, dueAt);
  if (status === "answered") return { tone: "ok", text: "", soon: false };
  if (status === "lapsed" || diff < 0) return { tone: "muted", text: diff < 0 ? `Lewat tenggat ${plural(-diff)}` : "Lewat tenggat", soon: false };
  if (diff === 0) return { tone: "warn", text: "Tenggat hari ini", soon: true };
  return { tone: diff <= 3 ? "warn" : "muted", text: `${plural(diff)} lagi`, soon: diff <= 3 };
}

export function DueLine({ status, dueAt, answeredAt, now, className = "" }: { status: string; dueAt: string; answeredAt?: string | null; now: string; className?: string }) {
  if (status === "answered") return <span className={className}>Dijawab {fmtDateTime(answeredAt)}</span>;
  const d = dueInfo(status, dueAt, now);
  return (
    <span className={className}>
      <IconClock size={13} className="mr-1.5 inline-block -translate-y-px align-middle" />
      Tenggat {fmtDateTime(dueAt)}
      <span className={`ml-2 ${d.soon ? "font-medium text-warn" : "text-muted"}`}>{d.text}</span>
    </span>
  );
}

export interface ClarRow { id: string; finding_title: string; status: string; issue: string; due_at: string; sent_at: string; answered_at: string | null; doc_count: number }

/** Judul temuan berbentuk "Jenis: pokok". Jenis tampil sebagai label kecil agar daftar tidak berulang-ulang. */
function SplitTitle({ t }: { t: string }) {
  const i = t.indexOf(": ");
  if (i < 0) return <p className="text-body-sm font-semibold leading-snug text-ink">{t}</p>;
  return (
    <>
      <p className="text-caption text-muted">{t.slice(0, i)}</p>
      <p className="mt-0.5 text-body-sm font-semibold leading-snug text-ink first-letter:uppercase">{t.slice(i + 2)}</p>
    </>
  );
}

/** Satu baris permintaan klarifikasi; seluruh baris adalah tautan ke halaman jawab. */
export function ClarificationItem({ c, now, compact = false }: { c: ClarRow; now: string; compact?: boolean }) {
  const l = CLARIFICATION_LABEL[c.status];
  return (
    <Link href={`/faskes/klarifikasi/${c.id}`} className="group flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-subtle/70">
      <div className="min-w-0 flex-1">
        <div className="flex flex-col-reverse items-start gap-1.5 sm:flex-row sm:justify-between sm:gap-3">
          <div className="min-w-0">
            <SplitTitle t={c.finding_title} />
          </div>
          <StatusPill tone={l.tone} title={l.hint}>{l.label}</StatusPill>
        </div>
        {!compact && <p className="mt-1 line-clamp-2 max-w-3xl text-body-sm leading-relaxed text-ink-soft sm:line-clamp-1">{c.issue}</p>}
        <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-muted">
          <DueLine status={c.status} dueAt={c.due_at} answeredAt={c.answered_at} now={now} />
          <span>
            <IconFile size={13} className="mr-1.5 inline-block -translate-y-px align-middle" />
            {c.doc_count} dokumen
          </span>
          <span title="Nomor permintaan klarifikasi">No. <span className="font-mono">{c.id}</span></span>
        </p>
      </div>
      <IconChevronRight size={16} className="mt-1 shrink-0 text-line-strong transition-colors group-hover:text-ink-soft" />
    </Link>
  );
}

export interface FindingRowData { id: string; title: string; type_label: string; claim_no: string | null; admit_date: string; updated_at: string; proof_status: ProofStatus; open_clarification_ids: string[]; has_open_dispute: boolean }

/** Satu baris temuan dengan status. */
export function FindingItem({ f }: { f: FindingRowData }) {
  return (
    <Link href={`/faskes/temuan/${f.id}`} className="group flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-subtle/70">
      <div className="min-w-0 flex-1">
        <SplitTitle t={f.title} />
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-caption text-muted">
          <span title="Nomor temuan">Temuan <span className="font-mono">{f.id}</span></span>
          {f.claim_no && <span title="Nomor klaim (sintetis)">Klaim <span className="font-mono">{f.claim_no}</span></span>}
          <span>Perawatan {fmtDate(f.admit_date)}</span>
          <span>Diperbarui {fmtDate(f.updated_at)}</span>
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <ProofBadge status={f.proof_status} />
          {f.open_clarification_ids.length > 0 && <StatusPill tone="warn">Perlu jawaban</StatusPill>}
          {f.has_open_dispute && <StatusPill tone="info">Bantahan dikirim</StatusPill>}
        </div>
      </div>
      <IconChevronRight size={16} className="mt-1 shrink-0 text-line-strong transition-colors group-hover:text-ink-soft" />
    </Link>
  );
}

const STAGES: ActionStatus[] = ["open", "in_progress", "resolved", "follow_up_pending", "closed"];

/** Kemajuan tindakan perbaikan: lima tahap berurutan (urutan ini memang berurutan). */
export function ActionProgress({ status }: { status: string }) {
  const idx = Math.max(0, STAGES.indexOf(status as ActionStatus));
  return (
    <div role="group" aria-label={`Tahap ${idx + 1} dari ${STAGES.length}: ${ACTION_LABEL[STAGES[idx]]}`}>
      <div className="flex gap-1">
        {STAGES.map((s, i) => (
          <span key={s} aria-hidden className={`h-1.5 flex-1 rounded-full ${i <= idx ? (status === "closed" ? "bg-ok" : "bg-brand") : "bg-line"}`} />
        ))}
      </div>
      <ol className="mt-2 hidden grid-cols-5 gap-1 sm:grid">
        {STAGES.map((s, i) => (
          <li key={s} aria-current={i === idx ? "step" : undefined} className={`text-caption leading-snug ${i === idx ? "font-medium text-ink" : "text-muted"}`}>{ACTION_LABEL[s]}</li>
        ))}
      </ol>
      <p className="mt-2 text-caption text-ink-soft sm:hidden">
        <span className="tabular-nums text-muted">Tahap {idx + 1} dari {STAGES.length}</span>
        <span className="ml-2 font-medium text-ink">{ACTION_LABEL[STAGES[idx]]}</span>
      </p>
    </div>
  );
}

export interface TimelineItem { at: string; title: ReactNode; note?: ReactNode; tone?: Tone }
const TL_DOT: Record<Tone, string> = { muted: "bg-line-strong", info: "bg-info", warn: "bg-accent", ok: "bg-ok", danger: "bg-danger" };

/** Riwayat sebuah temuan: urut waktu, terlama di atas. */
export function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <ol className="relative space-y-4 pl-5 before:absolute before:bottom-1 before:left-[4px] before:top-1.5 before:w-px before:bg-line before:content-['']">
      {items.map((it, i) => (
        <li key={i} className="relative">
          <span aria-hidden className={`absolute -left-5 top-[5px] h-[9px] w-[9px] rounded-full ring-4 ring-subtle ${TL_DOT[it.tone ?? "muted"]} ${i === items.length - 1 ? "scale-125" : ""}`} />
          <p className={`text-body-sm leading-snug ${i === items.length - 1 ? "font-semibold text-ink" : "font-medium text-ink-soft"}`}>{it.title}</p>
          <p className="mt-0.5 text-caption tabular-nums text-muted">{fmtDateTime(it.at)}</p>
          {it.note && <p className="mt-1 text-caption leading-relaxed text-ink-soft">{it.note}</p>}
        </li>
      ))}
    </ol>
  );
}

/** Lencana pemrosesan dokumen. */
export function DocStatus({ status }: { status: string }) {
  if (status === "needs_manual_transcription") return <StatusPill tone="warn">Menunggu transkripsi manual</StatusPill>;
  if (status === "reviewed") return <StatusPill tone="ok">Sudah ditelaah</StatusPill>;
  return <StatusPill tone="ok">Teks terbaca</StatusPill>;
}

export const kb = (size: number) => `${(size / 1024).toFixed(1)} KB`;
