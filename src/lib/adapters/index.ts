import type Database from "better-sqlite3";
import { simulatedAdapters } from "./simulated";
import type { Adapters } from "./types";

/** Satu-satunya titik pemilihan implementasi adapter. Implementasi 'live' ditambahkan di sini kelak (mis. berdasarkan variabel lingkungan). */
export function getAdapters(db: Database.Database): Adapters {
  return simulatedAdapters(db);
}
export * from "./types";
