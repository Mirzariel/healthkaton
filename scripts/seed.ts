import { dbFile, resetDb } from "../src/lib/db";

resetDb();
console.log(`Basis data SEHATI diisi ulang dengan data sintetis: ${dbFile()}`);
