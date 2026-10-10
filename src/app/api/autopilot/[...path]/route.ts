/* Jalur autopilot lama dinonaktifkan. AI hanya membantu peninjauan: tidak ada keputusan klaim, pembayaran, sanksi, atau status temuan otomatis.
   Pengganti: /console/assistant (saran langkah yang diputuskan petugas) dan POST /api/casework/commands. */
const gone = () => Response.json({ ok: false, code: "gone", error: "Autopilot dinonaktifkan. AI hanya menyarankan; keputusan ada pada petugas. Gunakan /console/assistant." }, { status: 410 });
export const GET = gone;
export const POST = gone;
export const PUT = gone;
export const PATCH = gone;
export const DELETE = gone;
