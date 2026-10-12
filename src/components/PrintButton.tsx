"use client";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="no-print btn btn-secondary">
      Cetak atau simpan PDF
    </button>
  );
}
