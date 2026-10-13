#!/usr/bin/env node
/* Codemod tipografi (fase 1): ganti ukuran teks arbitrer (text-[13px], text-sm, ...) dengan token
   skala tipe (text-caption, text-body-sm, ..., text-display) yang didefinisikan di globals.css.
   Pakai:  node scripts/codemod-type.mjs --dry   (hanya hitung per berkas)
           node scripts/codemod-type.mjs         (terapkan)
   Prefiks varian (md:, hover:, group-hover:, [&>p]:, !) dipertahankan. Ukuran relatif em
   (mis. text-[0.85em]) sengaja tidak disentuh. */
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const SRC = join(ROOT, "src");
const DRY = process.argv.includes("--dry");

const SIZE_ORDER = ["caption", "code", "body-sm", "body", "body-lg", "title-3", "title-2", "title-1", "headline", "display"];
const BREAKPOINTS = ["sm", "md", "lg", "xl", "2xl"];

/** Ukuran dalam px -> token. null = jangan disentuh. */
function tokenForPx(px) {
  if (px < 13.25) return "caption";
  if (px < 14.25) return "body-sm";
  if (px < 15.5) return "body";
  if (px < 17.5) return "body-lg";
  if (px < 22) return "title-3";
  if (px < 27) return "title-2";
  if (px < 36) return "title-1";
  if (px < 80) return "headline";
  return "display";
}

/** Nilai di dalam text-[...] atau xs/sm -> {token, px}. */
function mapValue(v) {
  if (v === "xs") return { token: "caption", px: 12 };
  if (v === "sm") return { token: "body-sm", px: 14 };
  let m = /^(\d+(?:\.\d+)?)px$/.exec(v);
  if (m) return { token: tokenForPx(+m[1]), px: +m[1] };
  m = /^(\d+(?:\.\d+)?)rem$/.exec(v);
  if (m) return { token: tokenForPx(+m[1] * 16), px: +m[1] * 16 };
  m = /^clamp\(([^,]+),([^,]+),([^)]+)\)$/.exec(v);
  if (m) {
    const max = /^(\d+(?:\.\d+)?)rem$/.exec(m[3].trim());
    if (max) return { token: tokenForPx(+max[1] * 16), px: +max[1] * 16 };
  }
  return null; // em, var(), dsb.
}

const CLASS_RE = /(?<=^|[\s"'`{])((?:[\w-]+:|\[[^\]\s]+\]:)*)(!?)text-(\[[^\]\s]+\]|xs|sm)(?=$|[\s"'`}])/g;

function transformString(str, stats) {
  const hasMono = /(^|\s)font-mono(\s|$)/.test(str);
  const hits = [];
  for (const m of str.matchAll(CLASS_RE)) {
    const raw = m[3].startsWith("[") ? m[3].slice(1, -1) : m[3];
    const mapped = mapValue(raw);
    if (!mapped) continue;
    let token = mapped.token;
    if (hasMono && token === "caption" && mapped.px >= 11 && mapped.px <= 12.5) token = "code";
    hits.push({ index: m.index, length: m[0].length, prefix: m[1], bang: m[2], token });
  }
  if (!hits.length) return str;
  // Judul hero: jika satu string memuat ukuran tingkat display, seluruh ukurannya menjadi display.
  if (hits.some((h) => h.token === "display")) for (const h of hits) h.token = "display";

  // Buang varian responsif yang menjadi duplikat ukuran di breakpoint sebelumnya (token fluid sudah menskalakan sendiri).
  const responsive = hits
    .filter((h) => h.prefix === "" || BREAKPOINTS.includes(h.prefix.slice(0, -1)))
    .filter((h) => !h.bang)
    .sort((a, b) => (a.prefix ? BREAKPOINTS.indexOf(a.prefix.slice(0, -1)) + 1 : 0) - (b.prefix ? BREAKPOINTS.indexOf(b.prefix.slice(0, -1)) + 1 : 0));
  let prev = null;
  for (const h of responsive) {
    if (prev !== null && h.prefix && h.token === prev) h.drop = true;
    else prev = h.token;
  }

  let out = "";
  let last = 0;
  for (const h of hits.sort((a, b) => a.index - b.index)) {
    if (h.drop) {
      // Buang kelas beserta satu spasi pemisah sebelumnya.
      out += str.slice(last, h.index).replace(/\s$/, "");
    } else {
      out += str.slice(last, h.index) + `${h.prefix}${h.bang}text-${h.token}`;
    }
    last = h.index + h.length;
    stats.count++;
  }
  out += str.slice(last);
  return out;
}

function transformFile(src) {
  const stats = { count: 0 };
  // Literal string satu baris ("..." / '...') dan template literal (`...`, boleh multi-baris).
  const out = src.replace(/"[^"\n]*"|'[^'\n]*'|`[^`]*`/g, (lit) => {
    if (!lit.includes("text-")) return lit;
    const q = lit[0];
    const body = lit.slice(1, -1);
    const next = transformString(body, stats);
    return q + next + q;
  });
  return { out, count: stats.count };
}

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (/\.(tsx?|mts)$/.test(name)) acc.push(p);
  }
  return acc;
}

let total = 0;
for (const file of walk(SRC)) {
  const src = readFileSync(file, "utf8");
  const { out, count } = transformFile(src);
  if (!count) continue;
  total += count;
  console.log(`${String(count).padStart(4)}  ${relative(ROOT, file)}`);
  if (!DRY && out !== src) writeFileSync(file, out);
}
console.log(`${DRY ? "[dry] " : ""}total: ${total} kelas`);
