"use client";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="no-print btn-depth rounded-lg px-4 py-2 text-sm font-bold text-white">
      Cetak atau simpan PDF
    </button>
  );
}
