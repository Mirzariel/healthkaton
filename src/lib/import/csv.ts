/* Pemecah CSV (RFC 4180 sederhana): tanda kutip ganda, koma/baris baru di dalam kutipan, CRLF, BOM. Pemisah koma atau titik koma (otomatis). */

export interface CsvParsed {
  header: string[];
  rows: { line: number; cells: string[] }[];
  delimiter: "," | ";";
}

export function detectDelimiter(headerLine: string): "," | ";" {
  const c = (headerLine.match(/,/g) ?? []).length;
  const s = (headerLine.match(/;/g) ?? []).length;
  return s > c ? ";" : ",";
}

export function parseCsv(input: string): CsvParsed {
  const text = input.replace(/^﻿/, "");
  const firstLine = text.split(/\r\n|\n|\r/, 1)[0] ?? "";
  const delimiter = detectDelimiter(firstLine);
  const rows: { line: number; cells: string[] }[] = [];
  let row: string[] = [];
  let cur = "";
  let q = false;
  let line = 1;
  let rowStart = 1;
  const endRow = () => {
    row.push(cur);
    cur = "";
    if (row.some((c) => c.trim() !== "")) rows.push({ line: rowStart, cells: row });
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else { cur += ch; if (ch === "\n") line++; }
    } else if (ch === '"' && cur === "") q = true;
    else if (ch === delimiter) { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      endRow();
      line++;
      rowStart = line;
    } else cur += ch;
  }
  if (cur !== "" || row.length) endRow();
  const header = (rows.shift()?.cells ?? []).map((h) => h.trim().toLowerCase());
  return { header, rows, delimiter };
}

/** Penulis CSV untuk templat dan ekspor. Sel yang diawali = + - @ diberi apostrof agar tidak dieksekusi sebagai rumus pada spreadsheet. */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    let s = v === null || v === undefined ? "" : String(v);
    if (/^[=+\-@]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s)) s = "'" + s;
    return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(esc).join(",")).join("\r\n") + "\r\n";
}
