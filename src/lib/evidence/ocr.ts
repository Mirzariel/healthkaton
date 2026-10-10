import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/* Adapter OCR. Berjalan HANYA bila mesinnya benar-benar ada di lingkungan (tesseract; untuk PDF pindaian juga pdftoppm).
   Tanpa mesin, aplikasi menampilkan "perlu transkripsi manual". Tidak ada hasil OCR palsu untuk dokumen sembarang. */

export interface OcrResult { engine: string; pages: { page: number; text: string }[] }
export interface OcrAdapter {
  name: string;
  /** Apakah mesin tersedia untuk jenis input ini. */
  available(kind: "image" | "pdf"): boolean;
  reason(kind: "image" | "pdf"): string;
  recognize(bytes: Buffer, kind: "image" | "pdf"): Promise<OcrResult>;
}

let probe: { tesseract: boolean; pdftoppm: boolean } | null = null;
function detect() {
  if (probe) return probe;
  const has = (cmd: string) => { try { return spawnSync(cmd, ["--version"], { timeout: 4000 }).status === 0 || spawnSync(cmd, ["-v"], { timeout: 4000 }).status === 0; } catch { return false; } };
  probe = process.env.SEHATI_OCR === "off" ? { tesseract: false, pdftoppm: false } : { tesseract: has("tesseract"), pdftoppm: has("pdftoppm") };
  return probe;
}
/** Hanya untuk tes: reset hasil deteksi mesin. */
export function _resetOcrProbe() { probe = null; }

function run(cmd: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const t = setTimeout(() => { p.kill("SIGKILL"); reject(new Error(`${cmd} melewati batas waktu`)); }, timeoutMs);
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", (e) => { clearTimeout(t); reject(e); });
    p.on("close", (code) => { clearTimeout(t); code === 0 ? resolve(out) : reject(new Error(`${cmd} gagal (${code}): ${err.slice(0, 120)}`)); });
  });
}

export function tesseractAdapter(): OcrAdapter {
  const lang = process.env.SEHATI_OCR_LANG || "eng";
  return {
    name: `tesseract (${lang})`,
    available: (kind) => (kind === "pdf" ? detect().tesseract && detect().pdftoppm : detect().tesseract),
    reason(kind) {
      const d = detect();
      if (process.env.SEHATI_OCR === "off") return "OCR dimatikan lewat SEHATI_OCR=off.";
      if (!d.tesseract) return "Mesin OCR (tesseract) tidak terpasang di lingkungan ini.";
      if (kind === "pdf" && !d.pdftoppm) return "PDF pindaian butuh pdftoppm untuk diubah menjadi gambar; tidak terpasang di lingkungan ini.";
      return "";
    },
    async recognize(bytes, kind) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sehati-ocr-"));
      try {
        const files: string[] = [];
        if (kind === "image") {
          const f = path.join(dir, "in.img");
          fs.writeFileSync(f, bytes);
          files.push(f);
        } else {
          fs.writeFileSync(path.join(dir, "in.pdf"), bytes);
          await run("pdftoppm", ["-r", "200", "-png", "-l", "10", path.join(dir, "in.pdf"), path.join(dir, "pg")], 60_000);
          files.push(...fs.readdirSync(dir).filter((n) => n.startsWith("pg") && n.endsWith(".png")).sort().map((n) => path.join(dir, n)));
        }
        const pages: { page: number; text: string }[] = [];
        for (let i = 0; i < files.length; i++) pages.push({ page: i + 1, text: (await run("tesseract", [files[i], "stdout", "-l", lang], 90_000)).trim() });
        return { engine: `tesseract ${lang}`, pages };
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    },
  };
}

export function defaultOcr(): OcrAdapter {
  return tesseractAdapter();
}
