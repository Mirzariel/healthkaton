/* Penjaga sistem desain: ukuran teks harus memakai token skala tipe (text-caption, text-body, ...),
   bukan ukuran arbitrer seperti text-[13px] atau text-[1.75rem]. Ukuran relatif em
   (mis. text-[0.85em], untuk teks sebaris yang mengikuti induknya) tetap diizinkan.
   Perbaiki pelanggaran dengan: node scripts/codemod-type.mjs */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const SRC = join(ROOT, "src");

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (/\.(ts|tsx)$/.test(name)) acc.push(p);
  }
  return acc;
}

describe("design tokens", () => {
  it("tidak ada ukuran teks arbitrer (text-[NNpx|rem]) di src/", () => {
    const offenders: string[] = [];
    const re = /text-\[(\d[^\]]*)\]/g;
    for (const file of walk(SRC)) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          for (const m of line.matchAll(re)) {
            if (/^\d*\.?\d+em$/.test(m[1])) continue; // em relatif diizinkan
            offenders.push(`${relative(ROOT, file)}:${i + 1}  ${m[0]}`);
          }
        });
    }
    expect(offenders, `Pakai token skala tipe, bukan ukuran arbitrer:\n${offenders.join("\n")}`).toEqual([]);
  });
});
