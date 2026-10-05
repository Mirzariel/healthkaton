import { IconCheck, IconLock, IconQuestion, IconX } from "@/components/m/icons";
import { ANSWERS, phraseFor } from "@/components/m/phrases";

/** Tiruan layar aplikasi peserta (gaya foto produk). Isi & label jawaban sama dengan /m. */
export function PhoneMock({ firstName, code, item, date, hospital }: { firstName: string; code: string; item: string; date: string; hospital: string }) {
  const ph = phraseFor(code, item);
  const icon = { sesuai: IconCheck, tidak_sesuai: IconX, tidak_ingat: IconQuestion } as const;
  return (
    <div className="relative mx-auto w-[300px]" aria-hidden>
      {/* tombol samping */}
      <span className="absolute -left-[2px] top-[118px] h-8 w-[3px] rounded-l-sm bg-[#2a2c2b]" />
      <span className="absolute -left-[2px] top-[164px] h-14 w-[3px] rounded-l-sm bg-[#2a2c2b]" />
      <span className="absolute -right-[2px] top-[150px] h-20 w-[3px] rounded-r-sm bg-[#2a2c2b]" />

      {/* rangka logam tipis + bezel hitam */}
      <div className="rounded-[3.2rem] bg-gradient-to-b from-[#3a3d3b] via-[#1c1e1d] to-[#2c2f2d] p-[3px] shadow-[0_1px_2px_rgb(0_0_0/0.12),0_24px_48px_-16px_rgb(0_0_0/0.28),0_60px_100px_-40px_rgb(0_0_0/0.3)]">
        <div className="rounded-[3.05rem] bg-black p-[7px]">
          <div className="relative flex h-[600px] flex-col overflow-hidden rounded-[2.6rem] bg-[#f6f5f1] text-ink">
            {/* status bar + dynamic island */}
            <div className="relative flex h-12 shrink-0 items-center justify-between px-7 pt-1 text-[13px] font-semibold">
              <span className="tabular-nums">9.41</span>
              <span className="absolute left-1/2 top-[11px] h-[26px] w-[90px] -translate-x-1/2 rounded-full bg-black" />
              <span className="flex items-center gap-1.5">
                <svg width="17" height="11" viewBox="0 0 17 11" fill="currentColor">
                  <rect x="0" y="7" width="3" height="4" rx="0.7" />
                  <rect x="4.5" y="5" width="3" height="6" rx="0.7" />
                  <rect x="9" y="2.5" width="3" height="8.5" rx="0.7" />
                  <rect x="13.5" y="0" width="3" height="11" rx="0.7" />
                </svg>
                <svg width="24" height="12" viewBox="0 0 24 12" fill="none">
                  <rect x="0.5" y="0.5" width="20" height="11" rx="3" stroke="currentColor" opacity="0.4" />
                  <rect x="2" y="2" width="15" height="8" rx="1.8" fill="currentColor" />
                  <path d="M22 4v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
                </svg>
              </span>
            </div>

            {/* kepala aplikasi */}
            <div className="flex items-center justify-between px-5 pb-3 pt-2">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">JKN Mobile</p>
                <p className="text-[19px] font-semibold tracking-tight">Halo, {firstName}</p>
              </div>
              <span className="grid h-9 w-9 place-items-center rounded-full bg-ink text-sm font-semibold text-white">{firstName.charAt(0)}</span>
            </div>

            {/* kartu pertanyaan */}
            <div className="mx-3 flex flex-1 flex-col rounded-[1.4rem] bg-white p-4 shadow-[0_1px_2px_rgb(0_0_0/0.05)] ring-1 ring-black/[0.06]">
              <p className="text-[11px] font-medium text-muted">Pertanyaan singkat dari BPJS Kesehatan</p>
              <p className="mt-1.5 text-[17px] font-semibold leading-snug tracking-tight">Apakah Anda menjalani {ph.title.toLowerCase()}?</p>
              {ph.desc && <p className="mt-1.5 text-[12.5px] leading-snug text-ink-soft">{ph.desc}</p>}
              <p className="mt-2.5 text-[11.5px] text-muted">
                {date} · {hospital}
              </p>

              <div className="mt-4 space-y-2">
                {ANSWERS.map((a) => {
                  const on = a.value === "tidak_sesuai";
                  const I = icon[a.value];
                  return (
                    <div
                      key={a.value}
                      className={`flex items-center gap-3 rounded-2xl px-3.5 py-3 text-[13.5px] font-semibold ${on ? "bg-ink text-white" : "bg-[#f6f5f1] text-ink ring-1 ring-black/[0.06]"}`}
                    >
                      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${on ? "bg-white/15" : "bg-white ring-1 ring-black/[0.06]"}`}>
                        <I size={15} />
                      </span>
                      <span className="flex-1">{a.label}</span>
                      {on && <IconCheck size={16} className="text-mint" />}
                    </div>
                  );
                })}
              </div>
              <span className="mt-auto block rounded-2xl bg-brand py-3 text-center text-[13.5px] font-semibold text-white">Kirim jawaban</span>
            </div>

            <p className="flex items-center justify-center gap-1.5 px-5 py-3 text-[11px] text-muted">
              <IconLock size={12} /> Jawaban Anda aman dan rahasia.
            </p>
            <span className="mx-auto mb-2 block h-[5px] w-28 shrink-0 rounded-full bg-ink/85" />
          </div>
        </div>
      </div>
      {/* bayangan lantai */}
      <div className="mx-auto mt-6 h-4 w-48 rounded-[50%] bg-black/10 blur-md" />
    </div>
  );
}
