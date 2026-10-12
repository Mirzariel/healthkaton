import { Tag } from "@/components/casework/parts";
import { IconArrowLeft, IconChecklist, IconCpu, IconFile, IconHistory, IconHome, IconInbox, IconLayers, IconSparkle } from "@/components/icons";
import SehatiLogo from "@/components/SehatiLogo";
import { ProofBadge } from "@/components/ui";
import { PRIORITY_LABEL } from "@/lib/casework/labels";
import type { ProofStatus } from "@/lib/labels";
import { PreviewViewport } from "./PreviewViewport";

/* Non-interactive excerpts of the same synthetic case as the actual apps. */
export interface TheaterData {
  findingId: string; caseId: string; title: string; proof: ProofStatus; priority: number;
  assignee: string | null; facility: string; diagnosis: string | null; stay: string | null;
  claimNo: string | null; service: string | null; amount: string | null; documented: boolean;
  lay: string | null; when: string | null; auditCount: number;
}
const SIDE = [
  { Icon: IconHome, label: "Ringkasan" }, { Icon: IconInbox, label: "Antrean kasus" },
  { Icon: IconSparkle, label: "Asisten AI" }, { Icon: IconChecklist, label: "Pra-pengajuan" },
  { Icon: IconFile, label: "Dokumen bukti" }, { Icon: IconLayers, label: "Pemilahan pending" },
  { Icon: IconCpu, label: "Dasbor AI" }, { Icon: IconHistory, label: "Jejak audit" },
];
function Sources({ d, compact = false }: { d: TheaterData; compact?: boolean }) {
  const rows = [
    { label: "Yang ditagih", value: d.service ?? "Layanan", note: d.amount, warn: false },
    { label: "Catatan faskes", value: d.documented ? "Catatan ditemukan" : "Catatan belum ditemukan", note: "Bisa jadi belum tertaut", warn: !d.documented },
    { label: "Pengalaman peserta", value: "Ditanyakan langsung", note: "Satu pertanyaan terarah", warn: false },
  ];
  return <div className={compact ? "divide-y divide-line" : "grid grid-cols-3 gap-3"}>{rows.map(r => (
    <div key={r.label} className={compact ? "grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 py-3" : `min-w-0 rounded-xl border p-4 ${r.warn ? "border-warn/25 bg-warn-soft" : "border-line bg-card"}`}>
      <p className={`text-[12px] font-medium ${r.warn ? "text-warn" : "text-muted"}`}>{r.label}</p>
      <div className="min-w-0"><p className={`${compact ? "" : "mt-2"} text-[14px] font-semibold leading-snug`}>{r.value}</p><p className="mt-1 text-[12px] tabular-nums text-ink-soft">{r.note}</p></div>
    </div>
  ))}</div>;
}
function ConsolePreview({ d }: { d: TheaterData }) {
  const pr = PRIORITY_LABEL[d.priority] ?? { label: "Sedang", tone: "warn" as const };
  return <div className="flex h-full flex-col bg-paper text-ink">
    <div className="flex h-9 shrink-0 items-center gap-4 border-b border-line bg-card px-4">
      <span className="flex gap-1.5"><span className="size-2 rounded-full bg-line-strong" /><span className="size-2 rounded-full bg-line-strong" /><span className="size-2 rounded-full bg-line-strong" /></span>
      <p className="flex-1 text-center text-[11px] text-muted">Cuplikan konsol · data sintetis</p><span className="w-9" />
    </div>
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-[192px] shrink-0 flex-col bg-night px-3 py-4 text-on-night">
        <div className="px-2"><SehatiLogo size={22} inverse /></div><p className="mt-8 px-2 text-[12px] text-on-night-soft">Kerja</p>
        <div className="mt-2 space-y-1">{SIDE.map(({ Icon, label }, i) => <div key={label} className={`flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] ${i === 1 ? "bg-white/10 font-semibold text-white" : "text-on-night-soft"}`}><Icon size={16} />{label}</div>)}</div>
        <p className="mt-auto border-t border-white/10 px-2 pt-4 text-[11px] leading-relaxed text-on-night-soft">Prototipe. Bukan produk resmi BPJS Kesehatan.</p>
      </aside>
      <div className="min-w-0 flex-1">
        <div className="flex h-12 items-center justify-between border-b border-line px-6 text-[12px]"><span className="font-medium">Konsol petugas <span className="ml-2 text-muted">Lingkungan demo</span></span><span className="text-muted">{d.assignee ?? "Verifikator"}</span></div>
        <div className="p-6">
          <p className="text-[12px] text-muted">Antrean kasus / <span className="font-mono">{d.caseId}</span></p><h3 className="mt-3 text-[26px] font-semibold tracking-tight">Kasus {d.caseId}</h3><p className="mt-1 text-[13px] text-ink-soft">Bukti, ringkasan, dan keputusan untuk satu perawatan.</p>
          <div className="mt-5 grid grid-cols-[minmax(0,1fr)_190px] items-start gap-4">
            <div className="min-w-0 space-y-3">
              <div className="rounded-xl border border-line bg-card p-4 shadow-depth-1"><p className="font-mono text-[11px] text-muted">{d.findingId}</p><h4 className="mt-1 text-[18px] font-semibold leading-snug">{d.title}</h4><div className="mt-3 flex flex-wrap gap-2"><ProofBadge status={d.proof} /><Tag t={pr.tone === "danger" ? "warn" : pr.tone}>Prioritas {pr.label.toLowerCase()}</Tag></div></div>
              <section className="rounded-xl border border-line bg-card"><p className="border-b border-line px-4 py-3 text-[14px] font-semibold">Klaim dan bukti pelaksanaan</p><div className="p-4"><p className="mb-3 text-[12px] text-ink-soft">{d.facility}{d.diagnosis ? ` · ${d.diagnosis}` : ""}</p><Sources d={d} />{d.claimNo && <p className="mt-3 font-mono text-[11px] text-muted">{d.claimNo}</p>}<p className="mt-3 rounded-lg bg-brand-tint px-3 py-2 text-[12px] leading-relaxed text-ink-soft">Dokumen yang belum ditemukan belum membuktikan layanan tidak dilakukan.</p></div></section>
              <div className="flex items-center justify-between rounded-xl border border-line bg-card px-4 py-3 text-[13px]"><span className="font-semibold">Klarifikasi ke faskes</span><span className="text-muted">Hak jawab lebih dulu</span></div>
            </div>
            <aside className="space-y-3">
              <div className="rounded-xl bg-subtle p-4"><p className="text-[13px] font-semibold">Status kasus</p><dl className="mt-3 space-y-3 text-[12px]"><div><dt className="text-muted">Faskes</dt><dd className="mt-1">{d.facility}</dd></div><div><dt className="text-muted">Episode perawatan</dt><dd className="mt-1">{d.stay ?? "—"}</dd></div><div><dt className="text-muted">Penanggung jawab</dt><dd className="mt-1">{d.assignee ?? "Belum ditugaskan"}</dd></div></dl></div>
              <div className="rounded-xl bg-subtle p-4 text-[12px]"><p className="font-semibold">Jejak audit</p><p className="mt-2 flex items-center gap-1.5 text-ink-soft"><IconHistory size={14} />{d.auditCount.toLocaleString("id-ID")} entri tercatat</p><p className="mt-2 text-muted">AI menyarankan. Petugas memutuskan.</p></div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  </div>;
}
function PhonePreview({ d }: { d: TheaterData }) {
  return <div className="flex h-full flex-col bg-paper text-ink" style={{ fontSize: 19 }}>
    <div className="flex h-11 shrink-0 items-center justify-between bg-card px-6 text-[12px] font-semibold"><span>9:41</span><span className="h-5 w-24 rounded-full bg-ink" /><span className="flex items-center gap-1.5"><span className="text-muted">LTE</span><span className="h-2.5 w-5 rounded-sm border border-ink bg-ink" /></span></div>
    <div className="flex shrink-0 items-center gap-3 border-b border-line bg-card px-4 py-4"><IconArrowLeft size={22} /><div><p className="text-[19px] font-semibold">Satu pertanyaan singkat</p><p className="mt-1 text-[14px] text-muted">{d.facility}</p></div></div>
    <div className="min-h-0 flex-1 space-y-4 p-4">
      <p className="rounded-xl border border-line bg-subtle px-3 py-3 text-[15px] leading-snug text-ink-soft">Pertanyaan draf. Jawaban bukan dasar penilaian resmi.</p>
      <div className="rounded-2xl rounded-tl-md border border-line bg-card p-4 shadow-depth-1"><p className="text-[21px] font-semibold leading-snug">Apakah Anda menjalani {d.lay} pada {d.when}?</p><p className="mt-3 text-[15px] text-ink-soft">Lupa atau tidak yakin itu wajar.</p></div>
      <div className="grid gap-2.5">{["Ya", "Tidak", "Saya lupa / tidak yakin"].map((label, i) => <div key={label} className={`flex min-h-14 items-center gap-3 rounded-2xl border px-4 py-3 text-[20px] font-semibold leading-snug ${i === 2 ? "border-dashed border-line-strong text-ink-soft" : "border-line-strong bg-card"}`}><span className="size-6 shrink-0 rounded-full border-2 border-line-strong" />{label}</div>)}</div>
    </div>
    <div className="shrink-0 border-t border-line bg-card px-4 pb-3 pt-3"><div className="grid grid-cols-2 gap-2 text-center text-[14px] font-medium"><span className="rounded-xl border border-line px-2 py-3">Bantuan petugas</span><span className="rounded-xl border border-line px-2 py-3">Berhenti sekarang</span></div><p className="mt-3 text-[12px] leading-snug text-muted">“Tidak yakin” tidak menambah skor sinyal.</p><div className="mx-auto mt-4 h-1 w-28 rounded-full bg-ink" /></div>
  </div>;
}
export function Theater({ d }: { d: TheaterData }) {
  return <figure className="m-0">
    <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,18rem)] lg:gap-6">
      <div aria-hidden="true" className="hidden min-w-0 overflow-hidden rounded-xl border border-white/15 shadow-depth-3 md:block"><PreviewViewport width={1120} height={700}><ConsolePreview d={d} /></PreviewViewport></div>
      <div aria-hidden="true" className="rounded-xl border border-line bg-paper p-4 text-ink md:hidden"><p className="text-[12px] text-muted">Cuplikan kasus demo <span className="font-mono">{d.caseId}</span></p><h3 className="mt-2 text-[17px] font-semibold leading-snug">{d.title}</h3><div className="my-3"><ProofBadge status={d.proof} /></div><Sources d={d} compact /></div>
      {d.lay && <div aria-hidden="true" className="mx-auto w-[min(100%,18rem)] min-w-0 rounded-[2.6rem] border border-white/20 bg-ink p-2 shadow-depth-3"><div className="overflow-hidden rounded-[2.1rem]"><PreviewViewport width={375} height={812}><PhonePreview d={d} /></PreviewViewport></div></div>}
    </div>
    <figcaption className="mt-8 grid gap-5 sm:grid-cols-3 sm:gap-8">{[
      ["Tiga sumber dipertemukan", "Tagihan, catatan faskes, dan pengalaman peserta dalam satu episode."],
      ["Sinyal, bukan putusan", "Selisih memulai pemeriksaan. Faskes mendapat hak jawab lebih dulu."],
      ["Peserta ditanya, bukan dicurigai", "Satu pertanyaan sederhana. Ragu-ragu tidak menambah kecurigaan."],
    ].map(([title, body]) => <div key={title} className="border-t border-white/15 pt-4"><p className="text-[14px] font-semibold text-white">{title}</p><p className="mt-1 text-[13px] leading-relaxed text-on-night-soft">{body}</p></div>)}</figcaption>
  </figure>;
}
