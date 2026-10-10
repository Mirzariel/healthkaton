import { deflateSync } from "node:zlib";

/* Pembangkit berkas contoh yang valid (PDF teks, PDF tanpa lapisan teks, PNG). Dipakai seed demo dan tes.
   Ini BUKAN dokumen medis nyata: isi seluruhnya sintetis. */

const latin1 = (s: string) => s.replace(/[^\x20-\x7e]/g, "?").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

function buildPdf(pages: { content: string }[]): Buffer {
  const objs: string[] = [];
  const add = (body: string) => { objs.push(body); return objs.length; };
  const fontId = 3 + pages.length * 2;
  const kids: number[] = [];
  add("<< /Type /Catalog /Pages 2 0 R >>");
  add(""); // Pages, diisi setelah daftar halaman diketahui
  pages.forEach((pg, i) => {
    const pageId = 3 + i * 2;
    const contentId = pageId + 1;
    kids.push(pageId);
    add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    add(`<< /Length ${Buffer.byteLength(pg.content, "latin1")} >>\nstream\n${pg.content}\nendstream`);
  });
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  objs[1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

/** PDF berlapis teks: setiap elemen `pages` = baris-baris teks satu halaman. */
export function makeTextPdf(pages: string[][]): Buffer {
  return buildPdf(pages.map((lines) => ({ content: "BT /F1 12 Tf 50 780 Td 16 TL\n" + lines.map((l) => `(${latin1(l)}) Tj T*`).join("\n") + "\nET" })));
}

/** PDF tanpa lapisan teks (hanya gambar garis), meniru dokumen hasil pindai. */
export function makeScanLikePdf(pageCount = 1): Buffer {
  return buildPdf(Array.from({ length: pageCount }, () => ({ content: "0.85 g 40 40 515 760 re f 0.2 G 1 w 60 700 m 520 700 l S 60 640 m 520 640 l S 60 580 m 520 580 l S" })));
}

const CRC_TABLE = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t.push(c >>> 0);
  }
  return t;
})();
const crc32 = (buf: Buffer) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** PNG skala abu-abu sintetis (kertas pindai dengan garis-garis), tanpa teks yang dapat dibaca mesin. */
export function makeScanPng(width = 240, height = 320): Buffer {
  const rows: Buffer[] = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(width + 1);
    row[0] = 0;
    for (let x = 0; x < width; x++) {
      const margin = x < 16 || x > width - 16 || y < 16 || y > height - 16;
      const rule = y > 40 && y % 28 < 2 && x > 24 && x < width - 24;
      row[x + 1] = margin ? 215 : rule ? 70 : 238;
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // kedalaman bit
  ihdr[9] = 0; // skala abu-abu
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.concat(rows))), chunk("IEND", Buffer.alloc(0))]);
}
