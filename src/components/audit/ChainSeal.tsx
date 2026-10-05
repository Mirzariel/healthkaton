import { InfoDot, Term } from "@/components/explain";
import { shortHash } from "@/lib/auditView";
import type { ChainCheck } from "@/lib/audit";

export interface ChainLink {
  id: number;
  hash: string;
}

/** Pusat perhatian halaman audit: status rantai hash, besar dan mudah dipahami. */
export function ChainSeal({ chain, links }: { chain: ChainCheck; links: ChainLink[] }) {
  const ok = chain.ok;
  return (
    <section
      aria-label="Status integritas jejak audit"
      className={`mb-5 rounded-xl border bg-card p-5 md:p-6 ${ok ? "border-line" : "border-danger"}`}
    >
      <div className="grid items-center gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="flex items-start gap-4">
          <span
            className={`grid size-14 shrink-0 place-items-center rounded-full text-3xl font-semibold text-white ${ok ? "bg-ok" : "bg-danger"}`}
            aria-hidden
          >
            {ok ? "✓" : "×"}
          </span>
          <div className="min-w-0">
            <p className="eyebrow text-muted">Keutuhan jejak audit</p>
            <h2 className="mt-1 text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
              {ok ? (
                <>
                  <Term k="rantai">Rantai</Term> <em>utuh</em>
                </>
              ) : (
                <>Rantai putus di catatan #{chain.brokenAt}</>
              )}
            </h2>
            <p className="mt-2 max-w-md text-[15px] leading-relaxed text-ink-soft">
              {ok ? (
                <>
                  Semua <strong className="text-ink">{chain.total}</strong> catatan sudah diperiksa ulang oleh komputer dan <strong className="text-ink">tidak ada yang diubah</strong> sejak ditulis.
                </>
              ) : (
                <>Ada catatan yang isinya berbeda dari saat ditulis. Pemeriksaan berhenti di catatan #{chain.brokenAt}; selidiki sebelum laporan dipakai.</>
              )}
            </p>
            <p className="mt-2 max-w-md text-[13px] leading-relaxed text-muted">
              Setiap catatan menyimpan <Term k="hash">sidik jari digital</Term> catatan sebelumnya. Mengubah satu catatan saja akan memutus rantainya.
            </p>
          </div>
        </div>

        {links.length > 0 && (
          <div className="rounded-lg border border-line bg-paper p-4">
            <p className="mb-3 flex items-center gap-1.5 text-xs font-medium text-ink-soft">
              {links.length} catatan terbaru, dari yang lama ke yang baru
              <InfoDot k="rantai" />
            </p>
            <ol className="flex items-stretch overflow-x-auto pb-1" aria-label="Rangkaian catatan terbaru">
              {links.map((l, i) => (
                <li key={l.id} className="flex shrink-0 items-center">
                  {i > 0 && <span aria-hidden className="mx-1 h-px w-5 bg-ink/40 sm:w-7" />}
                  <div className={`rounded-md border bg-card px-3 py-2 ${i === links.length - 1 ? "border-ink" : "border-line"}`}>
                    <p className="text-[11px] text-muted">Catatan #{l.id}</p>
                    <p className="font-mono text-xs font-medium" title={l.hash}>{shortHash(l.hash, 6)}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-2 text-[11px] text-muted">Kode di dalam kotak = sidik jari singkat catatan itu.</p>
          </div>
        )}
      </div>
    </section>
  );
}
