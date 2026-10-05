import { CodeTag } from "@/components/explain";
import type { GlossaryKey } from "@/lib/glossary";

const BASE = String.raw`KLM-\d{4}-\d{6}|KS-\d{4}|F-\d{4}|P-\d{4}`;
const kind = (t: string): GlossaryKey => (t.startsWith("KLM") ? "klaim" : t.startsWith("KS") ? "kasus" : t.startsWith("F-") ? "temuan" : "peserta");
const escape = (c: string) => c.replace(/[.*+?^${}()|[\]\\]/g, (m) => "\\" + m);

/** Teks dari mesin kadang memuat nomor klaim/kasus atau kode layanan mentah.
 *  Di sini kode itu dibungkus CodeTag supaya bisa ditanyakan artinya. `serviceCodes` = kode layanan yang dikenal pada kasus ini. */
export function RichCodes({ text, serviceCodes = [] }: { text: string; serviceCodes?: string[] }) {
  const svc = [...new Set(serviceCodes)].filter(Boolean);
  const re = new RegExp(`(${BASE}${svc.length ? `|\\b(?:${svc.map(escape).join("|")})\\b` : ""})`, "g");
  const parts = text.split(re);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <CodeTag key={i} k={svc.includes(p) ? "layanan" : kind(p)} className="align-baseline">
            {p}
          </CodeTag>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}
