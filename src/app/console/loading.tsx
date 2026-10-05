/** Kerangka saat halaman konsol dimuat: bentuknya sama dengan isi, jadi tidak ada lompatan. */
export default function Loading() {
  return (
    <div role="status" aria-label="Memuat" className="animate-pulse">
      <div className="mb-6 h-24 rounded-xl border-b border-line bg-line/50" />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="border border-line bg-card h-28 rounded-xl" />
        ))}
      </div>
      <div className="border border-line bg-card space-y-3 rounded-xl p-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-10 rounded-lg bg-line/70" />
        ))}
      </div>
      <span className="sr-only">Memuat…</span>
    </div>
  );
}
