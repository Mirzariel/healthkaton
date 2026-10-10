"use client";

import { Msg, api, primary, useAct } from "./kit";

/** Menyimpan hasil pemeriksaan sebagai riwayat. Tidak mengubah klaim. `surface` = "faskes" untuk portal faskes. */
export function SaveRunButton({ claimId, surface }: { claimId: string; surface?: "faskes" }) {
  const a = useAct();
  return (
    <div>
      <button type="button" className={primary} disabled={a.busy} onClick={() => a.act(() => api(`/api/precheck${surface ? `?as=${surface}` : ""}`, "POST", { claimId, save: true }), { success: "Hasil pemeriksaan disimpan di riwayat." })}>Jalankan dan simpan hasil</button>
      <Msg msg={a.msg} ok={a.ok} />
    </div>
  );
}
