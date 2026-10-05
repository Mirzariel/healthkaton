import { cookies } from "next/headers";
import { ActionError, ROLES } from "./actions";
import type { Role } from "./types";

export const ROLE_COOKIE = "sehati_role";

export async function getRole(): Promise<Role> {
  const v = (await cookies()).get(ROLE_COOKIE)?.value;
  return (ROLES as string[]).includes(v ?? "") ? (v as Role) : "verifikator";
}

export async function run<T>(fn: () => T | Promise<T>) {
  try {
    const data = await fn();
    return Response.json({ ok: true, data });
  } catch (e) {
    if (e instanceof ActionError) return Response.json({ ok: false, error: e.message }, { status: e.status });
    console.error(e);
    return Response.json({ ok: false, error: "Terjadi kesalahan pada server." }, { status: 500 });
  }
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const v = await req.json();
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    throw new ActionError("Isi permintaan bukan JSON yang valid.");
  }
}
export const str = (v: unknown) => (typeof v === "string" ? v : "");
