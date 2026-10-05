import type { Metadata } from "next";
import Link from "next/link";
import { AutopilotControl } from "@/components/console/Autopilot";
import { IconArrow } from "@/components/console/icons";
import { CodeTag, InfoDot, PageGuide, Term } from "@/components/explain";
import { Card, EmptyState, MODUS_PLAIN, PageHeader } from "@/components/ui";
import { ROLE_LABEL } from "@/lib/actions";
import { getAutoStats, listAuto, type AutoListRow } from "@/lib/autopilot";
import { rupiah } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { getRole } from "@/lib/server";
import type { Role } from "@/lib/types";

export const metadata: Metadata = { title: "Keputusan otomatis · SEHATI" };

type SP = Promise<{ [k: string]: string | string[] | undefined }>;

const FILTERS = [
  { value: "tinjau", label: "Perlu ditinjau", test: (r: AutoListRow) => r.state === "diputus" && !!r.review_flag && r.review_status === "belum" },
  { value: "semua", label: "Semua keputusan", test: (r: AutoListRow) => r.state === "diputus" },
  { value: "menunggu", label: "Menunggu peserta", test: (r: AutoListRow) => r.state === "menunggu_peserta" && r.case_status !== "decided" },
  { value: "ditinjau", label: "Sudah ditinjau", test: (r: AutoListRow) => r.review_status !== "belum" },
] as const;

const DECISION: Record<string, { text: string; cls: string }> = {
  loloskan: { text: "Diloloskan", cls: "text-ok" },
  koreksi: { text: "Dikoreksi", cls: "text-warn" },
  tolak: { text: "Ditolak", cls: "text-danger" },
  eskalasi: { text: "Dieskalasi", cls: "text-info" },
};
const REVIEW: Record<AutoListRow["review_status"], string> = {
  belum: "Belum ditinjau",
  dikonfirmasi: "Disetujui",
  diubah: "Diubah petugas",
  dibuka_kembali: "Dikembalikan ke antrean",
};

function Outcome({ r }: { r: AutoListRow }) {
  if (r.state === "menunggu_peserta") return <span className="font-semibold text-info">Menunggu jawaban peserta</span>;
  const d = DECISION[r.decision ?? ""];
  return (
    <span>
      <span className={`font-semibold ${d?.cls ?? ""}`}>{d?.text ?? r.decision}</span>
      {r.decision === "koreksi" && r.correction ? <span className="ml-1.5 text-xs text-ink-soft">−{rupiah(r.correction)}</span> : null}
    </span>
  );
}

function Confidence({ r }: { r: AutoListRow }) {
  if (r.state !== "diputus") return <span className="text-muted">–</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-line" aria-hidden>
        <span className={`block h-full rounded-full ${r.confidence >= 70 ? "bg-ink" : "bg-accent"}`} style={{ width: `${r.confidence}%` }} />
      </span>
      <span className="tabular-nums">{r.confidence}%</span>
    </span>
  );
}

function ReviewCell({ r }: { r: AutoListRow }) {
  if (r.state !== "diputus") return <span className="text-muted">–</span>;
  return (
    <span className="block">
      <span className={r.review_status === "belum" ? (r.review_flag ? "font-semibold text-warn" : "text-ink-soft") : "font-medium"}>{REVIEW[r.review_status]}</span>
      {r.review_status === "belum" && r.review_flag && (
        <span className="block text-xs text-muted">{r.review_flag === "keyakinan_rendah" ? "Keyakinan rendah" : "Sampel acak"}</span>
      )}
      {r.review_status !== "belum" && r.reviewed_by && <span className="block text-xs text-muted">oleh {ROLE_LABEL[r.reviewed_by as Role] ?? r.reviewed_by}</span>}
    </span>
  );
}

export default async function AutopilotPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.f) ? sp.f[0] : sp.f;
  const f = FILTERS.find((x) => x.value === raw) ?? FILTERS[0];
  const db = getDb();
  const role = await getRole();
  const stats = getAutoStats(db);
  const all = listAuto(db);
  const rows = all.filter(f.test).sort((a, b) => Number(!!b.review_flag) - Number(!!a.review_flag) || a.confidence - b.confidence || a.case_id.localeCompare(b.case_id));
  const count = (v: (typeof FILTERS)[number]) => all.filter(v.test).length;

  return (
    <>
      <PageHeader
        eyebrow="Autopilot"
        title="Keputusan otomatis"
        purpose="Semua kasus yang diputus SEHATI tanpa menunggu petugas. Keputusan sudah berlaku; di sini Anda memeriksa, menyetujui, atau membatalkannya."
      />

      <AutopilotControl stats={stats} canControl={role === "verifikator" || role === "auditor"} compact />

      <PageGuide
        id="autopilot"
        intro={
          <>
            <Term k="autopilot">Autopilot</Term> memutus kasus yang rutin supaya petugas bisa fokus pada yang benar-benar perlu diperiksa. Mesinnya saat ini berbasis aturan (simulasi). Rencana penggantian dengan AI sungguhan ada di <code className="rounded bg-paper px-1 text-xs">docs/AI-AUTOPILOT.md</code>.
          </>
        }
        steps={[
          { title: "Mulai dari “Perlu ditinjau”", body: <>Berisi keputusan dengan <Term k="keyakinan">keyakinan</Term> di bawah 70% dan sampel acak 1 dari 10. Sisanya boleh dibiarkan.</> },
          { title: "Buka kasusnya", body: "Lihat dasar keputusan: sinyal yang ditemukan, bukti, dan jawaban peserta." },
          { title: "Setujui, ubah, atau kembalikan", body: "Setujui bila tepat. Ubah bila keliru (wajib beri alasan). Kembalikan ke antrean bila perlu diperiksa manual." },
          { title: "Semua tercatat", body: <>Keputusan mesin dan tinjauan petugas masuk <Link href="/console/audit" className="font-semibold underline underline-offset-4">jejak audit</Link> yang tidak bisa diubah diam-diam.</> },
        ]}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {FILTERS.map((x) => {
          const on = x.value === f.value;
          return (
            <Link
              key={x.value}
              href={x.value === "tinjau" ? "/console/autopilot" : `/console/autopilot?f=${x.value}`}
              scroll={false}
              aria-current={on ? "true" : undefined}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${on ? "bg-ink text-white" : "border border-line bg-card text-ink-soft hover:border-ink/30 hover:text-ink"}`}
            >
              {x.label}
              <span className={`rounded-full px-1.5 text-xs tabular-nums ${on ? "bg-white/20" : "bg-line text-ink-soft"}`}>{count(x)}</span>
            </Link>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <Card>
          <EmptyState title={all.length === 0 ? "Autopilot belum pernah dijalankan" : "Tidak ada kasus di kategori ini"}>
            {all.length === 0 ? "Nyalakan mode Otomatis di atas untuk memproses antrean." : f.value === "tinjau" ? "Semua keputusan yang ditandai sudah ditinjau." : null}
          </EmptyState>
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-medium text-ink-soft">
                <th scope="col" className="px-4 py-3">Pasien dan dugaan</th>
                <th scope="col" className="px-3 py-3">Keputusan mesin</th>
                <th scope="col" className="px-3 py-3">Keyakinan <InfoDot k="keyakinan" /></th>
                <th scope="col" className="px-3 py-3">Tinjauan <InfoDot k="tinjauOtomatis" /></th>
                <th scope="col" className="px-3 py-3 text-right">Nilai klaim</th>
                <th scope="col" className="w-20 px-3 py-3"><span className="sr-only">Buka</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.case_id} className="group relative border-b border-line/70 last:border-0 hover:bg-paper">
                  <td className="max-w-[320px] px-4 py-3.5">
                    <Link href={`/console/cases/${r.case_id}`} className="block truncate font-semibold after:absolute after:inset-0 after:content-['']">
                      {r.patient}
                    </Link>
                    <p className="truncate text-xs text-ink-soft">Diduga {MODUS_PLAIN[r.modus].short.toLowerCase()}</p>
                    <p className="relative z-10 mt-1 text-[11px] text-muted">
                      Kasus <CodeTag k="kasus">{r.case_id}</CodeTag>
                    </p>
                  </td>
                  <td className="max-w-[300px] px-3 py-3.5">
                    <Outcome r={r} />
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted" title={r.summary}>{r.summary}</p>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3.5"><Confidence r={r} /></td>
                  <td className="px-3 py-3.5"><ReviewCell r={r} /></td>
                  <td className="whitespace-nowrap px-3 py-3.5 text-right font-medium tabular-nums">{rupiah(r.claim_amount)}</td>
                  <td className="px-3 py-3.5 text-right" aria-hidden>
                    <span className="inline-flex items-center gap-1 rounded-md border border-line px-2.5 py-1 text-xs font-semibold text-ink-soft group-hover:border-ink group-hover:bg-ink group-hover:text-white">
                      Buka <IconArrow width={13} height={13} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
