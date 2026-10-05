import type { ReactNode } from "react";

/** Kartu langkah bernomor dengan garis penghubung ke langkah berikutnya (server-safe, tanpa state). */
export function StepCard({
  n,
  title,
  lead,
  last = false,
  children,
}: {
  n: number;
  title: string;
  lead?: ReactNode;
  last?: boolean;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={`step-${n}`} className="relative grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-3 sm:grid-cols-[3.25rem_minmax(0,1fr)] sm:gap-x-4">
      <div className="relative flex flex-col items-center">
        <span className="z-[1] grid size-10 shrink-0 place-items-center rounded-full bg-ink text-lg font-semibold text-white">
          {n}
        </span>
        {!last && <span aria-hidden className="mt-1 w-px flex-1 bg-line" />}
      </div>
      <div className="min-w-0 pb-6">
        <div className="rounded-xl border border-line bg-card p-4 md:p-5">
          <h2 id={`step-${n}`} className="text-xl font-semibold leading-tight tracking-tight">
            {title}
          </h2>
          {lead && <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-soft">{lead}</p>}
          <div className="mt-4">{children}</div>
        </div>
      </div>
    </section>
  );
}
