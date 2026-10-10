import { cookies } from "next/headers";
import { ZodError } from "zod";
import { getDb } from "./db";
import { AuthError, ROLES, SESSION_COOKIE, readSession, signSession, type Principal, type Role } from "./auth/principal";
import { TransitionError } from "./domain/transitions";
import { DomainError } from "./idem";
import { RegistryError } from "./standards/registry";

/* Lapisan server: sesi demo, pembungkus API, dan pemetaan galat → HTTP.
   Pemilih peran HANYA untuk demo data sintetis (SEHATI_DEMO_ROLES=0 mematikannya). Otorisasi sebenarnya ada di fungsi domain. */

export type Surface = "peserta" | "faskes" | "konsol";
export const SURFACE_ROLES: Record<Surface, Role[]> = {
  peserta: ["peserta", "pendamping"],
  faskes: ["faskes"],
  konsol: ["verifikator", "reviewer", "auditor", "admin"],
};
const DEFAULT_USER: Record<Surface, string> = { peserta: "U-PSR-1", faskes: "U-FSK-1", konsol: "U-VER-1" };

export const demoRolesEnabled = () => process.env.SEHATI_DEMO_ROLES !== "0";

interface UserRow { id: string; name: string; role: Role; facility_id: string | null; participant_id: string | null }

export function principalFromUser(u: UserRow, companionId: string | null = null): Principal {
  return { id: `${u.role}:${u.id}`, name: u.name, role: u.role, facilityId: u.facility_id, participantId: u.participant_id, companionId };
}

export function listPersonas(surface?: Surface): Principal[] {
  const db = getDb();
  const rows = db.prepare("SELECT id, name, role, facility_id, participant_id FROM users ORDER BY CASE role WHEN 'peserta' THEN 0 WHEN 'pendamping' THEN 1 WHEN 'faskes' THEN 2 ELSE 3 END, id").all() as UserRow[];
  const out = rows.map((u) => {
    const comp = u.role === "pendamping" ? (db.prepare("SELECT id FROM companions WHERE participant_id = ? AND authorized = 1 ORDER BY id LIMIT 1").get(u.participant_id) as { id: string } | undefined)?.id ?? null : null;
    return principalFromUser(u, comp);
  });
  return surface ? out.filter((p) => SURFACE_ROLES[surface].includes(p.role)) : out;
}

/** Principal untuk satu permukaan. Cookie hanya dipakai bila perannya sah untuk permukaan itu; selain itu persona bawaan permukaan. */
export async function getPrincipal(surface: Surface): Promise<Principal> {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  const p = demoRolesEnabled() ? readSession(raw) : null;
  if (p && SURFACE_ROLES[surface].includes(p.role)) {
    // pastikan pengguna masih ada (hasil reset data dapat mengubah isi)
    const exists = getDb().prepare("SELECT 1 FROM users WHERE id = ?").get(p.id.split(":")[1]);
    if (exists) return p;
  }
  const personas = listPersonas(surface);
  return personas.find((x) => x.id.endsWith(DEFAULT_USER[surface])) ?? personas[0];
}

export async function setPersona(userId: string): Promise<Principal> {
  if (!demoRolesEnabled()) throw new AuthError("Pemilih peran dinonaktifkan pada lingkungan ini.");
  const p = listPersonas().find((x) => x.id.endsWith(`:${userId}`));
  if (!p) throw new DomainError("Persona tidak dikenal.", 404);
  (await cookies()).set(SESSION_COOKIE, signSession(p), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 12 });
  return p;
}

export const roleLabelOf = (r: Role) => ROLES.includes(r) ? r : "peserta";

export function errorResponse(e: unknown) {
  if (e instanceof AuthError) return Response.json({ ok: false, error: e.message, code: "forbidden" }, { status: e.status });
  if (e instanceof DomainError) return Response.json({ ok: false, error: e.message, code: e.code ?? "domain" }, { status: e.status });
  if (e instanceof TransitionError) return Response.json({ ok: false, error: e.message, code: "transition" }, { status: 409 });
  if (e instanceof RegistryError) return Response.json({ ok: false, error: e.message, code: "registry" }, { status: 422 });
  if (e instanceof ZodError) return Response.json({ ok: false, error: "Isi permintaan tidak valid.", issues: e.issues.map((i) => `${i.path.join(".")}: ${i.message}`) }, { status: 422 });
  const msg = e instanceof Error ? e.message : "";
  if (/transisi .* tidak diizinkan|append-only|CHECK constraint/i.test(msg)) return Response.json({ ok: false, error: `Ditolak oleh aturan basis data: ${msg}`, code: "db_guard" }, { status: 409 });
  console.error(e);
  return Response.json({ ok: false, error: "Terjadi kesalahan pada server." }, { status: 500 });
}

export async function run<T>(fn: () => T | Promise<T>) {
  try {
    const data = await fn();
    return Response.json({ ok: true, data });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const v = await req.json();
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    throw new DomainError("Isi permintaan bukan JSON yang valid.");
  }
}
export const str = (v: unknown) => (typeof v === "string" ? v : "");
export const num = (v: unknown) => (typeof v === "number" ? v : Number(v));
