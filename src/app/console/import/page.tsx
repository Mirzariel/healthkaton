import type { Metadata } from "next";
import { StepCard } from "@/components/audit/Step";
import { Term, PageGuide } from "@/components/explain";
import { ImportForm } from "@/components/ImportForm";
import { PageHeader } from "@/components/ui";
import { DX, SVC } from "@/lib/catalog";
import { CSV_COLUMNS, CSV_TEMPLATE, parseCsv } from "@/lib/csv";
import { rupiah } from "@/lib/dates";

export const metadata: Metadata = { title: "Impor data · SEHATI" };

type Col = (typeof CSV_COLUMNS)[number];
interface ColInfo {
  means: string;
  example: string;
  optional?: boolean;
}

/** Penjelasan awam tiap kolom. Bertipe lengkap: kolom baru di csv.ts wajib dijelaskan di sini. */
const COLS: Record<Col, ColInfo> = {
  participant_id: { means: "Nomor peserta. Karang sendiri, bebas, asal sama untuk peserta yang sama.", example: "IMP-P1" },
  participant_name: { means: "Nama peserta (fiktif/anonim).", example: "Contoh Peserta Satu" },
  coverage_start: { means: "Tanggal mulai menjadi peserta JKN.", example: "2022-01-01" },
  coverage_end: { means: "Tanggal berhenti jadi peserta. Kosongkan bila masih aktif.", example: "(kosong)", optional: true },
  episode_id: { means: "Nomor satu rangkaian perawatan. Tidak boleh sudah dipakai sebelumnya.", example: "IMP-E1" },
  hospital: { means: "Nama rumah sakit yang merawat.", example: "RS Contoh (simulasi)" },
  kind: { means: "RJTL = rawat jalan (pulang hari itu). RITL = rawat inap (menginap).", example: "RITL" },
  admit_at: { means: "Kapan pasien masuk. Format tahun-bulan-tanggal, jam boleh ditambah.", example: "2026-09-01T10:00" },
  discharge_at: { means: "Kapan pasien pulang. Tidak boleh lebih awal dari tanggal masuk.", example: "2026-09-04T11:00" },
  dx_code: { means: "Kode penyakit utama. Pilih dari daftar kode di bawah.", example: "J18.9" },
  claim_no: { means: "Nomor tagihan ke BPJS. Baris dengan nomor sama digabung jadi satu klaim.", example: "KLM-IMP-0001" },
  claim_amount: { means: "Nilai tagihan dalam rupiah, angka saja tanpa titik atau Rp.", example: "5200000" },
  claim_status: { means: "draft = belum dikirim. submitted = sudah diajukan. paid = sudah dibayar.", example: "draft" },
  service_code: { means: "Kode tindakan yang ditagihkan. Pilih dari daftar kode di bawah.", example: "BRONKO" },
  performed_at: { means: "Kapan tindakan itu dilakukan.", example: "2026-09-02T09:00" },
  performer: { means: "Nama dokter atau petugas yang melakukannya.", example: "dr. Contoh" },
  qty: { means: "Berapa kali tindakan dilakukan (bilangan bulat).", example: "1" },
  has_record: { means: "ya bila ada lembar tindakan sebagai bukti, tidak bila tidak ada. Inilah yang diperiksa untuk tagihan fiktif.", example: "tidak" },
};

const GROUPS: { title: string; hint: string; cols: Col[] }[] = [
  { title: "Siapa pasiennya", hint: "Peserta", cols: ["participant_id", "participant_name", "coverage_start", "coverage_end"] },
  { title: "Perawatan apa", hint: "Episode", cols: ["episode_id", "hospital", "kind", "admit_at", "discharge_at", "dx_code"] },
  { title: "Berapa ditagihkan", hint: "Klaim", cols: ["claim_no", "claim_amount", "claim_status"] },
  { title: "Tindakan apa saja", hint: "Layanan, satu baris per tindakan", cols: ["service_code", "performed_at", "performer", "qty", "has_record"] },
];

export default function ImportPage() {
  const sample = parseCsv(CSV_TEMPLATE);
  const head = sample[0];
  const rows = sample.slice(1);
  const col = (r: string[], c: Col) => r[head.indexOf(c)] ?? "";

  return (
    <>
      <PageHeader title="Impor data" purpose="Masukkan data klaim dari berkas tabel (CSV). SEHATI langsung memeriksanya dan membuka kasus bila ada kejanggalan." />

      <PageGuide
        id="impor"
        intro={<>Anda tidak perlu paham kode apa pun. Cukup ikuti empat langkah berurutan di bawah: ambil contoh, isi dengan data Anda, unggah, lalu lihat hasilnya. Satu kesalahan di berkas akan membatalkan seluruh impor, jadi data lama tidak akan rusak.</>}
        steps={[
          { title: "Unduh templat", body: <>Berkas <Term k="csv">CSV</Term> kosong berisi judul kolom dan 3 baris contoh.</> },
          { title: "Isi tabelnya", body: "Satu baris = satu tindakan yang ditagihkan. Arti tiap kolom dijelaskan di langkah 2." },
          { title: "Unggah atau tempel", body: "Pilih berkasnya, atau tempel isinya langsung. Lalu tekan Periksa dan impor." },
          { title: "Lihat hasil", body: "Sistem melapor berapa data masuk dan kasus baru apa yang terbuka." },
        ]}
        legend="Hanya data contoh atau anonim. Jangan unggah data peserta JKN sungguhan tanpa izin tertulis."
      />

      <div className="max-w-5xl">
        <StepCard n={1} title="Unduh templat" lead="Mulai dari berkas contoh agar judul kolom pasti benar. Bisa dibuka dengan Excel atau Google Sheets.">
          <div className="flex flex-wrap items-center gap-3">
            <a href="/api/import/template" download className="btn-depth inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 4v11m0 0l-4.500-4.500M12 15l4.500-4.500M5 19.500h14" /></svg>
              Unduh templat CSV
            </a>
            <p className="text-xs text-muted">sehati-templat-impor.csv · {CSV_COLUMNS.length} kolom · {rows.length} baris contoh</p>
          </div>
        </StepCard>

        <StepCard
          n={2}
          title="Isi tabel dengan data Anda"
          lead={<>Ganti baris contoh dengan data Anda. Kolom dikelompokkan menurut cerita: siapa pasiennya, perawatan apa, berapa ditagihkan, tindakan apa saja. <strong>Semua kolom wajib diisi</strong>, kecuali yang ditandai opsional.</>}
        >
          <div className="space-y-4">
            {GROUPS.map((g) => (
              <div key={g.title} className="overflow-hidden rounded-lg border border-line">
                <div className="flex items-baseline gap-2 bg-paper px-3.5 py-2">
                  
                  <h3 className="text-sm font-semibold">{g.title}</h3>
                  <span className="text-xs text-muted">{g.hint}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-left text-[13px]">
                    <caption className="sr-only">Kolom kelompok {g.title}</caption>
                    <thead>
                      <tr className="border-y border-line text-[11px] font-semibold uppercase tracking-wide text-muted">
                        <th scope="col" className="w-44 px-3.5 py-1.5">Nama kolom</th>
                        <th scope="col" className="px-3.5 py-1.5">Artinya</th>
                        <th scope="col" className="w-44 px-3.5 py-1.5">Contoh isi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.cols.map((c) => (
                        <tr key={c} className="border-b border-line/60 align-top last:border-0">
                          <th scope="row" className="px-3.5 py-2 text-left font-mono text-xs font-semibold text-brand-deep">
                            {c}
                            {COLS[c].optional && <span className="ml-1.5 rounded bg-line px-1 py-0.5 font-sans text-[10px] font-semibold text-ink-soft">opsional</span>}
                          </th>
                          <td className="px-3.5 py-2 leading-snug text-ink-soft">{COLS[c].means}</td>
                          <td className="px-3.5 py-2 font-mono text-xs text-ink">{COLS[c].example}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5">
            <h3 className="mb-1 text-base font-semibold">Contoh yang sudah terisi</h3>
            <p className="mb-2 text-sm text-ink-soft">
              Tiga baris ini menggambarkan satu pasien dengan satu klaim ({rupiah(Number(col(rows[0], "claim_amount")))}) yang berisi tiga tindakan. Perhatikan kolom <code className="font-mono text-xs">has_record</code>: bronkoskopi bernilai besar tetapi tidak punya lembar tindakan, jadi SEHATI akan menandainya sebagai kemungkinan tagihan fiktif.
            </p>
            <div className="overflow-x-auto rounded-lg border border-line bg-paper">
              <table className="w-full min-w-[620px] text-left text-xs">
                <thead>
                  <tr className="border-b border-line text-[11px] font-semibold text-muted">
                    <th scope="col" className="px-3 py-2">Tindakan (service_code)</th>
                    <th scope="col" className="px-3 py-2">Waktu</th>
                    <th scope="col" className="px-3 py-2">Dokter</th>
                    <th scope="col" className="px-3 py-2 text-right">Jumlah</th>
                    <th scope="col" className="px-3 py-2">Ada lembar tindakan?</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const code = col(r, "service_code");
                    const has = col(r, "has_record") === "ya";
                    return (
                      <tr key={i} className="border-b border-line/60 last:border-0">
                        <td className="px-3 py-2">
                          <span className="font-mono font-semibold">{code}</span> <span className="text-ink-soft">· {SVC[code]?.name}</span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 font-mono">{col(r, "performed_at").replace("T", " ")}</td>
                        <td className="px-3 py-2">{col(r, "performer")}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{col(r, "qty")}</td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex rounded-full px-2 py-0.5 font-medium ${has ? "bg-ok-soft text-ok" : SVC[code]?.needsRecord ? "bg-danger-soft text-danger" : "bg-line text-ink-soft"}`}>
                            {has ? "ya" : SVC[code]?.needsRecord ? "tidak (janggal)" : "tidak (wajar)"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <details className="group mt-5 rounded-lg border border-line">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3.5 py-3 text-sm font-bold [&::-webkit-details-marker]:hidden">
              <span className="inline-block text-brand transition-transform duration-150 group-open:rotate-90" aria-hidden>›</span>
              Daftar kode yang boleh dipakai
              <span className="ml-auto text-xs font-normal text-muted">{DX.length} diagnosis · {Object.keys(SVC).length} tindakan</span>
            </summary>
            <div className="grid gap-5 border-t border-line p-3.5 md:grid-cols-2">
              <div>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted"><Term k="diagnosis">Kode diagnosis</Term> (dx_code)</h3>
                <ul className="space-y-1 text-[13px]">
                  {DX.map((d) => (
                    <li key={d.code} className="flex gap-2"><span className="w-14 shrink-0 font-mono text-xs font-semibold text-brand-deep">{d.code}</span><span className="text-ink-soft">{d.text}</span></li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted"><Term k="layanan">Kode tindakan</Term> (service_code)</h3>
                <ul className="space-y-1 text-[13px]">
                  {Object.values(SVC).map((s) => (
                    <li key={s.code} className="flex gap-2"><span className="w-20 shrink-0 font-mono text-xs font-semibold text-brand-deep">{s.code}</span><span className="text-ink-soft">{s.name}</span></li>
                  ))}
                </ul>
              </div>
            </div>
            <p className="border-t border-line px-3.5 py-2 text-xs text-muted">Katalog ini contoh, bukan kode atau tarif resmi.</p>
          </details>
        </StepCard>

        <ImportForm sample={CSV_TEMPLATE} />
      </div>
    </>
  );
}
