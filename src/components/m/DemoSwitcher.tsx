import Link from "next/link";
import { ResetDemo } from "./ResetDemo";

export function DemoSwitcher({
  idPrefix,
  current,
  people,
  heroId,
  dark,
  consoleHref = "/console",
}: {
  idPrefix: string;
  current: string;
  people: { id: string; name: string }[];
  heroId: string;
  dark?: boolean;
  consoleHref?: string;
}) {
  const id = `${idPrefix}-who`;
  return (
    <div>
      <form action="/m" className="space-y-2">
        <label htmlFor={id} className={`block text-base font-medium ${dark ? "text-white/85" : "text-ink-soft"}`}>
          Peserta yang ditampilkan
        </label>
        <div className="flex gap-2">
          <select id={id} name="p" defaultValue={current} className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-white px-3 text-base font-medium text-ink">
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}{p.id === heroId ? " (tokoh cerita)" : ""}
              </option>
            ))}
          </select>
          <button className={`min-h-11 rounded-lg px-4 text-base font-semibold ${dark ? "bg-white text-ink hover:bg-white/90" : "bg-ink text-white hover:bg-ink/90"}`}>Ganti</button>
        </div>
        <p className={`text-sm leading-snug ${dark ? "text-white/55" : "text-muted"}`}>Tiap peserta punya riwayat perawatan dan pertanyaan yang berbeda.</p>
      </form>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        <Link href={consoleHref} className={`inline-flex min-h-11 items-center text-base font-semibold underline underline-offset-4 ${dark ? "text-white" : "text-brand"}`}>
          Buka konsol petugas →
        </Link>
        <ResetDemo dark={dark} />
      </div>
    </div>
  );
}
