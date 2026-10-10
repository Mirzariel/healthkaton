import type { Proposal } from "./types";

/* Leksikon aturan untuk menafsirkan jawaban bebas berbahasa sehari-hari.
   Dua tingkat, sengaja dibedakan:
   - `extractBaseline`: HANYA slot yang sedang ditanyakan, kecocokan kata kunci pada seluruh jawaban. Ini baseline "aturan" pada evaluasi.
   - `extractEnriched`: memperhatikan klausa pertama untuk slot yang ditanya, slot lain pada indikator yang sama, pembedaan instruksi vs kejadian,
     dan penolakan teks yang tampak seperti perintah. Dipakai oleh simulator referensi (BUKAN model AI).
   Kutipan selalu potongan asli dari jawaban (huruf asli dipertahankan). Kata kunci bersifat heuristik dan tidak lengkap, dan itu memang bagian dari yang diukur. */

const NOT_UNDERSTOOD = /(maksudnya|tidak paham|ga paham|gak paham|nggak paham|gak ngerti|ga ngerti|tidak mengerti|kurang paham|bingung)/i;
const UNKNOWN = /(\blupa\b|tidak ingat|ga ingat|gak ingat|nggak ingat|kurang yakin|tidak yakin|ga yakin|tidak tahu|ga tau|gak tau|nggak tau|kurang tahu|\bentah|sama sekali ga ingat)/i;
const NEG = /\b(tidak|tak|nggak|ngga|enggak|gak|ga|tdk|belum|blm|bukan)\b/i;
const AFFIRM = /\b(iya|ya|betul|benar|sudah|udah|ada|pernah|dijelaskan|dijelasin|diminta|disuruh|dikasih|diperiksa|datang|diambil|dilakukan|diukur|ditanya|dicocokkan|diberi tahu|diberitahu)\b/i;
const NOT_APPLICABLE = /tidak berlaku/i;

export const INJECTION = /(abaikan|lupakan|ignore|instruksi|system prompt|sistem:|\bprompt\b|tandai|catat (bahwa|saja|')|isi saja|jawab (ya|saja)|tulis kutipan|ubah status|tolak klaim|\bfraud\b|anggap saja|jangan tanya|di semua pertanyaan)/i;

/** Potong jawaban menjadi klausa (menjaga posisi) agar kutipan tetap substring asli. */
export function clauses(text: string): { text: string; start: number }[] {
  const out: { text: string; start: number }[] = [];
  const re = /[^.,;!?\n]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const raw = m[0];
    const trimmed = raw.trim();
    if (!trimmed) continue;
    out.push({ text: trimmed, start: m.index + raw.indexOf(trimmed) });
  }
  return out;
}

function clauseWith(text: string, re: RegExp): string | null {
  for (const c of clauses(text)) if (re.test(c.text)) return c.text;
  return null;
}

type Lex = { value: string; re: RegExp }[];
const CHOICE: Record<string, Lex> = {
  medication_receipt: [
    { value: "partial", re: /\b(sebagian|separuh|setengah(?! sadar)|tidak semua|ga semua|gak semua)\b/i },
    { value: "none", re: /\b(belum|blm|tidak|tdk|ga|gak|nggak)\b[^.,;!?]{0,20}\b(dapat|dpt|terima|trima|dikasih|diberi|menerima|dapet)\b/i },
    { value: "full", re: /\b(semua(nya)?|smua|lengkap|komplit)\b/i },
  ],
  reported_reason: [
    { value: "not_covered", re: /(tidak ditanggung|ga ditanggung|gak ditanggung|bukan tanggungan|tidak di ?cover)/i },
    { value: "no_reason_given", re: /(tidak (ada|dikasih|kasih|dijelaskan|dijelasin)[^.,;]{0,18}(alasan|kenapa)|tidak dijelaskan kenapa|tidak kasih alasan|alasan[^.,;]{0,10}tidak)/i },
    { value: "stock_out", re: /(habis|kosong|\bstok|\bstock|tidak tersedia|lagi ga ada)/i },
  ],
};

const BOOL_SLOTS_DEFAULT = true;

function matchChoice(slot: string, text: string): { value: string; quote: string } | null {
  const lex = CHOICE[slot];
  if (!lex) return null;
  for (const { value, re } of lex) {
    const q = clauseWith(text, re);
    if (q) return { value, quote: q };
  }
  return null;
}

/** Nilai meta (tidak tahu / tidak paham) terlebih dahulu: tidak boleh pernah menjadi jawaban positif atau negatif (aturan I3). */
function matchMeta(text: string): { value: "unknown" | "not_understood"; quote: string } | null {
  const nu = clauseWith(text, NOT_UNDERSTOOD);
  if (nu) return { value: "not_understood", quote: nu };
  const un = clauseWith(text, UNKNOWN);
  if (un) return { value: "unknown", quote: un };
  return null;
}

export interface SlotInfo { slot: string; values: string[] }

/** Baseline aturan: hanya slot yang ditanyakan. Negasi di bagian mana pun dari jawaban dianggap menolak. */
export function extractBaseline(askedSlot: string, text: string, allowed: SlotInfo[]): Proposal[] {
  const info = allowed.find((a) => a.slot === askedSlot);
  if (!info) return [];
  const meta = matchMeta(text);
  if (meta) return [{ slot: askedSlot, ...meta }];
  if (CHOICE[askedSlot]) {
    const m = matchChoice(askedSlot, text);
    return m && info.values.includes(m.value) ? [{ slot: askedSlot, value: m.value, quote: m.quote }] : [];
  }
  if (info.values.includes("not_applicable") && NOT_APPLICABLE.test(text)) return [{ slot: askedSlot, value: "not_applicable", quote: clauseWith(text, NOT_APPLICABLE) as string }];
  if (!BOOL_SLOTS_DEFAULT || !info.values.includes("yes")) return [];
  if (NEG.test(text)) return [{ slot: askedSlot, value: "no", quote: (clauseWith(text, NEG) ?? text.trim()) }];
  if (AFFIRM.test(text)) return [{ slot: askedSlot, value: "yes", quote: (clauseWith(text, AFFIRM) ?? text.trim()) }];
  return [];
}

interface CrossRule { slot: string; value: string; re: RegExp; unless?: RegExp }
const DIRECTED_RE = /(disuruh|disarankan|diminta|katanya suruh|disarankan)[^.;!?]{0,25}\b(beli|membeli|menebus|nebus)\b/i;
/** Slot lain yang dapat disimpulkan dari satu jawaban. Pembedaan penting: instruksi/saran (directed_*) bukan kejadian (outside_purchase). */
const CROSS: CrossRule[] = [
  { slot: "directed_outside_purchase", value: "yes", re: DIRECTED_RE },
  { slot: "outside_purchase", value: "yes", re: /\b(saya|akhirnya|terpaksa|lalu|jadi saya)\b[^.;!?]{0,20}\b(beli|membeli|menebus)\b[^.;!?]{0,25}(luar|apotek|sendiri)/i, unless: DIRECTED_RE },
  { slot: "out_of_pocket_paid", value: "yes", re: /(bayar sendiri|uang sendiri|kantong sendiri|keluar uang)/i },
  { slot: "replacement_arranged", value: "no", re: /\b(tidak|ga|gak|nggak)\b[^.,;!?]{0,12}\b(pengganti|diganti)\b/i },
  { slot: "replacement_arranged", value: "yes", re: /\b(obat pengganti|digantikan|diganti dengan|dikasih ganti)\b/i },
  { slot: "doctor_introduced", value: "no", re: /\b(tidak|ga|gak|nggak)\b[^.,;!?]{0,12}\b(pernah )?(kenalan|memperkenalkan)/i },
  { slot: "condition_plan_explained", value: "no", re: /\b(tidak|ga|gak|nggak)\b[^.;!?]{0,16}\b(menjelaskan|kasih tau|kasih tahu|dijelaskan|dijelasin)\b/i },
  { slot: "lab_result_explained", value: "no", re: /\bhasil(nya)?\b[^.;!?]{0,25}\b(tidak|ga|gak|nggak|belum)\b[^.;!?]{0,25}\b(dikasih tahu|dikasih tau|disampaikan|dijelaskan|diberi tahu|dikabari)\b/i },
  { slot: "lab_done", value: "yes", re: /\b(darah (yang )?diambil|diambil darah|periksa darah|cek darah)/i },
  { slot: "fee_paid", value: "yes", re: /(sudah saya bayar|akhirnya (saya )?bayar|saya bayar|dibayar)/i },
];

/** Pengayaan: klausa pertama menentukan slot yang ditanya; slot lain diambil dari aturan silang; teks yang menyerupai perintah ditolak. */
export function extractEnriched(askedSlot: string, text: string, allowed: SlotInfo[]): { proposals: Proposal[]; uncertainties: string[]; helpNeeded: boolean } {
  if (INJECTION.test(text)) return { proposals: [], uncertainties: ["answer_contains_instruction_like_text"], helpNeeded: false };
  const out: Proposal[] = [];
  const allowedValues = (slot: string) => allowed.find((a) => a.slot === slot)?.values;
  const info = allowed.find((a) => a.slot === askedSlot);
  const cl = clauses(text);
  const first = cl[0]?.text ?? text;
  let helpNeeded = false;
  if (info) {
    const meta = matchMeta(text);
    if (meta) {
      out.push({ slot: askedSlot, ...meta });
      helpNeeded = meta.value === "not_understood";
    } else if (CHOICE[askedSlot]) {
      const m = matchChoice(askedSlot, text);
      if (m && info.values.includes(m.value)) out.push({ slot: askedSlot, value: m.value, quote: m.quote });
    } else if (info.values.includes("not_applicable") && NOT_APPLICABLE.test(text)) {
      out.push({ slot: askedSlot, value: "not_applicable", quote: clauseWith(text, NOT_APPLICABLE) as string });
    } else if (info.values.includes("yes")) {
      // klausa pertama dahulu; bila tidak tegas, baru seluruh jawaban
      const probe = [first, text];
      for (const part of probe) {
        const hasNeg = NEG.test(part);
        const hasAff = AFFIRM.test(part);
        if (hasNeg || hasAff) {
          const q = clauseWith(text, hasNeg ? NEG : AFFIRM) ?? part.trim();
          out.push({ slot: askedSlot, value: hasNeg ? "no" : "yes", quote: part === first ? first : q });
          break;
        }
      }
    }
  }
  for (const r of CROSS) {
    if (r.slot === askedSlot) continue;
    const vals = allowedValues(r.slot);
    if (!vals || !vals.includes(r.value)) continue;
    const q = clauseWith(text, r.re);
    // klausa yang sudah menjadi dasar jawaban atas slot yang ditanya tidak dipakai lagi untuk slot lain
    if (q && r.unless?.test(q)) continue;
    if (q && out.some((o) => o.slot === askedSlot && o.quote === q)) continue;
    if (q && !out.some((o) => o.slot === r.slot)) out.push({ slot: r.slot, value: r.value, quote: q });
  }
  // alasan obat (hanya bila slot itu diizinkan dan bukan slot yang ditanya)
  if (askedSlot !== "reported_reason" && allowedValues("reported_reason")) {
    const m = matchChoice("reported_reason", text);
    if (m && allowedValues("reported_reason")?.includes(m.value) && !out.some((o) => o.slot === "reported_reason")) out.push({ slot: "reported_reason", value: m.value, quote: m.quote });
  }
  // fakta tambahan hanya dari klausa yang berbeda dari klausa slot yang ditanya, tetapi selalu menjadi substring asli
  return { proposals: out.filter((o) => text.includes(o.quote)), uncertainties: [], helpNeeded };
}

/** Pemeriksaan "kutipan mendukung nilai": bila leksikon menafsirkan kutipan dengan nilai berbeda untuk slot pilihan, dukungan ditolak. Bila leksikon tak menafsirkan, tidak dapat menilai dan diterima. */
export function quoteConflicts(slot: string, value: string, quote: string): boolean {
  if (value === "unknown" || value === "not_understood") return !matchMeta(quote);
  if (!CHOICE[slot]) return false;
  const m = matchChoice(slot, quote);
  return !!m && m.value !== value;
}
