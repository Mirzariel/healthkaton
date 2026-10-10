import { getPrincipal, type Surface } from "./server";

/* Sebagian rute melayani konsol petugas dan portal faskes. Permukaan dipilih eksplisit lewat ?as=faskes (bawaan: konsol).
   Pemilih peran hanya untuk demo; yang menentukan tetap wewenang peran di fungsi domain. */
export const surfaceOf = (req: Request): Surface => (new URL(req.url).searchParams.get("as") === "faskes" ? "faskes" : "konsol");
export const principalFor = (req: Request) => getPrincipal(surfaceOf(req));
