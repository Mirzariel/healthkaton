import Link from "next/link";
import { BrandMark, ConsoleNav, MobileMenu, ParticipantLink, ResetButton, RoleSwitcher, type NavCounts } from "@/components/ConsoleChrome";
import { ROLES, ROLE_LABEL } from "@/lib/actions";
import { ROLE_HINT } from "@/components/ui";
import { MotionRoot } from "@/components/motion";
import { ts } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { getSeedNow, listCases } from "@/lib/queries";
import { getRole } from "@/lib/server";

export const dynamic = "force-dynamic";

function navCounts(): NavCounts {
  const db = getDb();
  const now = ts(getSeedNow(db));
  const active = listCases(db).filter((c) => c.status !== "decided");
  return { antrean: active.length, overdue: active.filter((c) => ts(c.due_at) < now).length };
}

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const role = await getRole();
  const counts = navCounts();
  return (
    <div className="canvas min-h-screen md:flex">
      <a href="#main" className="no-print sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[60] focus:rounded-lg focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:font-bold">
        Lewati ke konten
      </a>

      {/* Sidebar (layar lebar) */}
      <aside className="no-print hidden w-72 shrink-0 md:sticky md:top-0 md:block md:h-screen md:self-start">
        <div className="relative h-full overflow-hidden bg-ink text-white">
        <div className="relative flex h-full flex-col overflow-y-auto px-4 pb-4 pt-5">
          <Link href="/" aria-label="SEHATI, ke halaman awal" className="flex items-center gap-3 rounded-xl px-1 py-1">
            <BrandMark size={40} />
            <span>
              <span className="block text-xl font-semibold leading-none tracking-tight">SEHATI</span>
              <span className="mt-1 block text-[11px] font-medium text-white/50">Konsol petugas</span>
            </span>
          </Link>
          <p className="eyebrow mt-6 px-1 text-[10px] text-white/40">Menu</p>
          <div className="mt-2">
            <ConsoleNav counts={counts} />
          </div>
          <div className="mt-auto space-y-3 pt-6">
            <ParticipantLink tone="dark" />
            <ResetButton tone="dark" />
          </div>
        </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print z-30 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line bg-card px-4 py-2.5 md:sticky md:top-0 md:px-6">
          <div className="flex items-center gap-3 md:hidden">
            <MobileMenu counts={counts}>
              <ParticipantLink tone="dark" />
              <ResetButton tone="dark" />
            </MobileMenu>
            <Link href="/console" aria-label="SEHATI, konsol petugas" className="flex items-center gap-2">
              <BrandMark size={30} />
              <span className="text-lg font-semibold tracking-tight">SEHATI</span>
            </Link>
          </div>
          <p className="hidden text-sm text-muted md:block">
            <span className="font-semibold text-ink-soft">Konsol petugas</span> · pemeriksa klaim BPJS Kesehatan
          </p>
          <RoleSwitcher role={role} options={ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r], hint: ROLE_HINT[r] }))} />
        </header>
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 p-4 outline-none md:px-10 md:py-9">
          <div className="mx-auto w-full max-w-[1240px]">
          <MotionRoot>{children}</MotionRoot>
          <footer className="no-print mt-10 border-t border-line pt-3 text-xs text-muted">Prototipe Healthkathon 2026 · data contoh. Foto: Unsplash (Nappy, Daniel Sone/NCI), hanya suasana.</footer>
          </div>
        </main>
      </div>
    </div>
  );
}
