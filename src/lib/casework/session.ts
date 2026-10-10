import { cookies } from "next/headers";
import { SESSION_COOKIE, readSession, type Principal } from "../auth/principal";
import { demoRolesEnabled, getPrincipal, SURFACE_ROLES } from "../server";

/** Principal untuk rute yang dipakai konsol maupun portal faskes (mis. membaca dokumen): permukaan ditentukan dari peran pada sesi. */
export async function anyPrincipal(): Promise<Principal> {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  const s = demoRolesEnabled() ? readSession(raw) : null;
  if (s && SURFACE_ROLES.faskes.includes(s.role)) return getPrincipal("faskes");
  return getPrincipal("konsol");
}
