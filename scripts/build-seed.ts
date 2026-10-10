import fs from "node:fs";
import path from "node:path";
import { openDb, resetDb } from "../src/lib/db";

/* Membuat basis data demo yang sudah terisi (data sintetis) untuk disalin saat cold start. Dijalankan otomatis sebelum `next build`. */
const out = path.join(process.cwd(), "seed", "sehati-seed.db");
fs.mkdirSync(path.dirname(out), { recursive: true });
for (const f of [out, `${out}-wal`, `${out}-shm`]) fs.rmSync(f, { force: true });
const db = openDb(out);
resetDb(db);
db.pragma("wal_checkpoint(TRUNCATE)");
db.pragma("journal_mode = DELETE");
db.close();
console.log(`Basis data awal dibuat: ${out} (${(fs.statSync(out).size / 1e6).toFixed(1)} MB)`);
