/* Keputusan otomatis pada kasus dinonaktifkan (lihat /api/autopilot). */
const gone = () => Response.json({ ok: false, code: "gone", error: "Keputusan otomatis pada kasus dinonaktifkan. Gunakan POST /api/casework/commands; setiap keputusan dibuat petugas dan tercatat di audit." }, { status: 410 });
export const GET = gone;
export const POST = gone;
export const PUT = gone;
export const PATCH = gone;
export const DELETE = gone;
