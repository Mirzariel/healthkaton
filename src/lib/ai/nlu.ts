import type { InterviewRequest } from "./contract";

/* Penafsir jawaban berbasis aturan (deterministik). Dipakai oleh:
   - simulator AI (mode "Simulasi", BUKAN inferensi model),
   - fallback saat penyedia langsung gagal / keluarannya ditolak validator,
   - baseline aturan pada evaluasi.
   Ia hanya MENGUSULKAN fakta berkutipan untuk slot yang diizinkan server; keputusan tetap pada peserta (konfirmasi) dan backend. */

export const META = ["unknown", "not_understood", "not_applicable"] as const;

const ABBR: Record<string, string> = {
  ga: "tidak", gak: "tidak", nggak: "tidak", ngga: "tidak", enggak: "tidak", engga: "tidak", ndak: "tidak", tak: "tidak", tdk: "tidak", tidk: "tidak", gk: "tidak",
  blm: "belum", belom: "belum", blum: "belum",
  udah: "sudah", udh: "sudah", sdh: "sudah", sudh: "sudah", dah: "sudah",
  yg: "yang", dgn: "dengan", dg: "dengan", utk: "untuk", sm: "sama", jg: "juga", lg: "lagi", trs: "terus", bs: "bisa", klo: "kalau", kalo: "kalau",
  dpt: "dapat", dapet: "dapat", dikasi: "dikasih", dikasihkan: "dikasih", dikasihtau: "dikasih tahu", dikasitau: "dikasih tahu",
  obt: "obat", obatnya: "obat", obat2: "obat", obatan: "obat", org: "orang", sy: "saya", aku: "saya", gue: "saya", gw: "saya",
  smua: "semua", semuanya: "semua", sebgian: "sebagian", sbagian: "sebagian", sebagiannya: "sebagian",
  inget: "ingat", gatau: "tidak tahu", gtau: "tidak tahu", tau: "tahu", nggatau: "tidak tahu",
  dijelasin: "dijelaskan", jelasin: "jelaskan", ngejelasin: "menjelaskan", dijelaskannya: "dijelaskan",
  byr: "bayar", bayarnya: "bayar", dibeliin: "dibelikan", beli2: "beli", nebus: "menebus", ditebus: "ditebus",
  dr: "dokter", dokternya: "dokter", apotekernya: "apoteker", apotik: "apotek",
};

/** Kosakata kunci untuk koreksi salah ketik (jarak edit 1; atau 2 untuk kata ≥ 8 huruf). */
const VOCAB = [
  "obat", "sebagian", "belum", "tidak", "semua", "dokter", "periksa", "diperiksa", "dijelaskan", "menjelaskan", "bayar", "membayar", "dibayar", "beli", "membeli", "resep", "kosong", "habis", "stok",
  "diganti", "pengganti", "disuruh", "diminta", "disarankan", "diarahkan", "apotek", "kontrol", "jadwal", "lupa", "ingat", "paham", "mengerti", "lengkap", "sudah", "pernah", "datang", "laboratorium",
  "diambil", "darah", "hasil", "biaya", "tagihan", "tanggung", "ditanggung", "kendala", "masalah", "selesai", "diterima", "terima", "diberikan", "dikasih", "alasan", "sendiri", "akhirnya", "terpaksa",
];
const VOCAB_SET = new Set(VOCAB);

function lev(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    let rowMin = prev[0];
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
      rowMin = Math.min(rowMin, prev[j]);
    }
    if (rowMin > max) return max + 1;
  }
  return prev[b.length];
}

function fixToken(t: string): string {
  if (ABBR[t]) return ABBR[t];
  if (VOCAB_SET.has(t) || t.length < 5 || /\d/.test(t)) return t;
  const max = t.length >= 8 ? 2 : 1;
  let best: string | null = null;
  let bd = max + 1;
  for (const v of VOCAB) {
    const d = lev(t, v, max);
    if (d < bd) { bd = d; best = v; }
  }
  return best && bd <= max ? best : t;
}

/** Huruf kecil, tanpa tanda baca, singkatan dibakukan, salah ketik umum dikoreksi. */
export function norm(text: string): string {
  const base = text.toLowerCase().replace(/(\p{L})\1{2,}/gu, "$1$1").replace(/[^\p{L}\p{N}\s]/gu, " ");
  return base.split(/\s+/).filter(Boolean).map(fixToken).join(" ");
}

/** Pemeriksaan kutipan: kutipan harus muncul pada jawaban (tanpa memperhatikan huruf besar, tanda baca, spasi). */
export function quoteInAnswer(quote: string, answer: string): boolean {
  const q = squash(quote);
  return q.length > 0 && squash(answer).includes(q);
}
const squash = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Teks yang menyerupai perintah kepada sistem (bukan jawaban pengalaman layanan). Dilewati dari ekstraksi. */
const INSTRUCTION_LIKE = /(abaikan|lupakan|ignore|disregard|system prompt|prompt sistem|instruksi (sebelumnya|di atas)|kamu (adalah|harus|sekarang)|anda (harus|sekarang adalah)|tandai (kasus|semua|bahwa)|ubah (status|aturan|standar)|set (semua|slot|status)|jalankan|execute|override|admin mode|mode (admin|developer)|id pertanyaan|next[_ ]?question|json)/i;
export const isInstructionLike = (clause: string) => INSTRUCTION_LIKE.test(clause);

const HEDGE = /\b(mungkin|kayaknya|sepertinya|rasanya|kurang yakin|setahu saya|entah|agak lupa|kira kira)\b/;

const URGENT = /(\bsesak\b|(susah|sulit) (bernapas|bernafas|napas|nafas)|nyeri dada|dada\b.{0,25}\b(sakit|nyeri|sesak|berat)|pingsan|tidak sadar|pendarahan|perdarahan|darah (banyak|terus|mengalir)|muntah darah|kejang|bunuh diri|ingin mati|mau mati|tidak (kuat|tahan) lagi|demam tinggi|sakit (sekali|parah) (sekarang|banget)|gawat|darurat)/;
/** Kata kunci bantuan segera. Dipakai sebagai pengaman aturan, terlepas dari keluaran model. Tidak mendiagnosis: hanya mengarahkan ke manusia. */
export function urgentSignal(text: string): boolean {
  return URGENT.test(norm(text));
}

export interface Interpreted {
  slot: string;
  value: string;
  quote: string;
  hedged: boolean;
}

type Cue = RegExp;
const NEG: Cue = /\b(tidak|belum|bukan|tanpa|ga|kosong)\b/;
const POS: Cue = /\b(sudah|ada|iya|ya|betul|benar|pernah|sempat|dapat|dikasih|diberi|diberikan|dilakukan|dijelaskan|diperiksa|diukur|datang|ditanya|ditanyai|dicek|dicocokkan|diminta|disuruh|dimintai|menjelaskan|diterangkan|diberi tahu|dikasih tahu|terima|menerima)\b/;

interface YnRule { slots: string[]; topic: Cue; yes?: Cue; no?: Cue }
const yn = (slots: string[], topic: Cue, o: { yes?: Cue; no?: Cue } = {}): YnRule => ({ slots, topic, ...o });

const YN_RULES: YnRule[] = [
  yn(["membership_checked"], /(kartu|kepesertaan|bpjs|jkn|identitas|ktp).*(periksa|diperiksa|dicek|cek|dilihat|ditanya|diminta|ditunjukkan)|(periksa|cek|lihat|minta).*(kartu|kepesertaan|ktp)/),
  yn(["flow_explained"], /(alur|prosedur|tahapan|langkah).*(jelas|dijelaskan|tahu|diberi|dikasih|diterangkan)|(jelas|dijelaskan|diterangkan).*(alur|prosedur|tahapan)|alur pelayanan/),
  yn(["fee_requested", "discharge_fee_requested", "extra_fee_requested"], /(diminta|disuruh|dimintai|ditagih|dikenakan|ditarik).*(bayar|membayar|biaya|uang|rp|ribu|juta)|(bayar|membayar|biaya|uang|rp \d+).*(diminta|disuruh|dimintai|ditagih|dikenakan)|biaya tambahan|tarik biaya|dipungut/, { no: /\b(tidak|bukan|gratis|tanpa|ga)\b/ }),
  yn(["fee_paid", "discharge_fee_paid"], /\b(akhirnya|terpaksa|jadi|sudah|saya)\s+(me)?bayar|\bdibayar\b|bayar sendiri|saya kasih uang|\b(tidak|belum)\s+(jadi\s+)?(saya\s+)?(me)?bayar/, { no: /\b(tidak|belum|ga)\s+(jadi\s+)?(saya\s+)?(me)?bayar|tidak dibayar|gratis/ }),
  yn(["doctor_visit"], /dokter.*(datang|visit|periksa|keliling|kunjung|menjenguk|ketemu|bertemu)|(visit|kunjungan)\s*dokter|dokter (tidak|belum) (datang|pernah)/, { no: /\b(tidak|belum|ga)\b/, yes: /\b(datang|visit|periksa|keliling|kunjung|menjenguk|ketemu|bertemu|sudah|pernah)\b/ }),
  yn(["doctor_introduced"], /(dokter).*(kenalan|memperkenalkan|perkenalkan|menyebut nama|sebut nama)|memperkenalkan diri|perkenalan/),
  yn(["condition_plan_explained"], /(kondisi|penyakit|keadaan|rencana|perawatan|diagnosis).*(jelas|dijelaskan|diberi tahu|dikasih tahu|diterangkan|menjelaskan)|(menjelaskan|diterangkan|dijelaskan).*(kondisi|penyakit|rencana|perawatan)/),
  yn(["lab_done", "lab_performed"], /(darah|lab|laboratorium|urine|urin)\b.*(diambil|diperiksa|dites|dicek|diperiksakan|periksa|tes|cek)|(diambil|ambil|cek|tes|periksa)\s+(darah|urin|urine)|\bcek lab\b/),
  yn(["lab_result_explained"], /hasil.*(lab|laboratorium|darah|urin|urine|pemeriksaan).*(jelas|dijelaskan|disampaikan|diberi tahu|dikasih tahu|diterangkan)|(jelas|dijelaskan|disampaikan).*hasil.*(lab|darah|pemeriksaan)/),
  yn(["prescription_explained"], /dokter.*(jelaskan|menjelaskan|dijelaskan|diterangkan).*(obat|resep|cara)|(obat|resep).*(dijelaskan|dijelaskan oleh|diterangkan).*dokter/),
  yn(["medication_instructions_explained", "pharmacy_info_given"], /(cara|aturan)\s+(pakai|minum).*(jelas|dijelaskan|diberi tahu|dikasih tahu|diterangkan)|(apoteker|apotek|petugas).*(jelas|menjelaskan|dijelaskan).*(minum|pakai|obat)|aturan (minum|pakai)/),
  yn(["followup_info_given"], /(kontrol|kunjungan ulang|datang lagi|balik lagi).*(diberi tahu|dikasih tahu|dijadwalkan|disuruh|diminta|diinfokan)|(diberi tahu|dikasih tahu|disuruh|diminta).*(kontrol|datang lagi)|jadwal kontrol/),
  yn(["open_issue"], /(masih|belum).*(masalah|kendala|keluhan|selesai|beres)|(kendala|masalah).*(belum|masih)|(tidak ada|sudah tidak ada).*(kendala|masalah)|sudah (beres|selesai)/, { yes: /\b(masih|belum)\b/, no: /(tidak ada|sudah beres|sudah selesai|sudah tidak)/ }),
  yn(["identity_checked"], /(identitas|nama|ktp|kartu|rekam medis).*(cocok|dicocokkan|dicek|ditanya|dipastikan|diperiksa|konfirmasi)|dicocokkan/),
  yn(["vitals_measured"], /(tensi|tekanan darah|suhu|nadi|ditimbang|diukur|berat badan)/),
  yn(["lab_result_handed"], /hasil.*(lab|laboratorium|darah).*(diserah|dikasih|diberikan|diterima|dibawa)|diserahkan.*hasil/),
  yn(["discharge_prescription_expected"], /resep.*(pulang|dibawa pulang)|(pulang).*(resep|obat)/, { no: /(tidak ada|tanpa|tidak dikasih|tidak diberi|belum)/, yes: /(ada|dikasih|diberi|diberikan|dapat|menerima|diresepkan)/ }),
  yn(["prescription_expected"], /\bresep\b|diresepkan/, { no: /(tidak ada|tanpa|tidak dikasih|tidak diberi|tidak diresepkan)/, yes: /(ada|dikasih|diberi|diberikan|dapat|menerima|diresepkan)/ }),
  yn(["replacement_arranged"], /(diganti|pengganti|digantikan|dicarikan|dibantu|obat lain|disediakan)/, {
    yes: /(diganti|obat pengganti|digantikan|dicarikan|dibantu (cari|carikan|sediakan)|diberi (obat )?(lain|pengganti)|dikasih (obat )?(lain|pengganti)|ada penggantinya|disediakan)/,
    no: /(tidak|tak|belum|ga)\s+(ada\s+)?(diganti|pengganti|dibantu|dicarikan|digantikan|disediakan)|disuruh cari sendiri|cari sendiri/,
  }),
];

const DIRECTIVE = /\b(disuruh|diminta|diarahkan|disarankan|dianjurkan|suruh|katanya (harus|disuruh)|diharuskan)\b/;
const BUY = /\b(beli|membeli|menebus|tebus|ditebus|dibeli)\b/;

function clauses(text: string): string[] {
  return text
    .split(/(?<=[.!?;\n])\s+|\n+|,\s+(?=(?:tapi|namun|tetapi|sedangkan|sisanya|lalu|terus|kemudian)\b)|\s+(?=(?:tapi|namun|tetapi|sedangkan)\b)/i)
    .map((c) => c.trim())
    .filter(Boolean);
}

/** Satu nilai per slot: klausa pertama yang cocok menang. */
export function interpret(req: Pick<InterviewRequest, "last_turn" | "allowed_slots">, opts: { strict?: boolean } = {}): { items: Interpreted[]; uncertainties: string[]; needsHelp: boolean } {
  const allowed = new Map(req.allowed_slots.map((a) => [a.slot, a.values]));
  const answer = req.last_turn.answer_text;
  const target = req.last_turn.target_slot ?? null;
  const out = new Map<string, Interpreted>();
  const uncertainties: string[] = [];
  const put = (slot: string, value: string, quote: string, hedged: boolean) => {
    const vals = allowed.get(slot);
    if (!vals || !vals.includes(value) || out.has(slot)) return;
    out.set(slot, { slot, value, quote: quote.slice(0, 400), hedged });
  };

  const parts = clauses(answer);
  let ignoredInstruction = false;
  for (const raw of parts) {
    if (isInstructionLike(raw)) { ignoredInstruction = true; continue; }
    const c = norm(raw);
    if (!c) continue;
    const hedged = HEDGE.test(c);
    if (hedged && opts.strict) { uncertainties.push("hedged_statement_not_extracted"); continue; }

    // obat: urutan penting (sebagian > tidak > semua), instruksi membeli ≠ telah membeli
    if (allowed.has("medication_receipt")) {
      if (/\b(sebagian|setengah|separuh|sisanya|ada yang (belum|kurang|tidak)|belum lengkap|tidak lengkap|kurang lengkap)\b/.test(c)) put("medication_receipt", "partial", raw, hedged);
      else if (/\b(belum|tidak)\s+(menerima|terima|dapat|dikasih|diberi|diberikan|kebagian|diserahkan)|tidak ada obat|obat (belum|tidak) (ada|diberikan|diserahkan)|belum dikasih/.test(c)) put("medication_receipt", "none", raw, hedged);
      else if (/\b(semua|seluruh|lengkap)\b.*\b(obat|diterima|dapat|dikasih|terima)\b|\bobat\b.*\b(semua|lengkap)\b|\bsudah (terima|menerima|dapat|diterima|dikasih)\b.*\bobat\b|\bobat\b.*\bsudah (terima|diterima|dapat|dikasih)\b/.test(c) && !/\b(sebagian|belum|kurang)\b/.test(c)) put("medication_receipt", "full", raw, hedged);
    }
    const directive = DIRECTIVE.test(c) && BUY.test(c);
    if (directive) put("directed_outside_purchase", "yes", raw, hedged);
    else if (/\b(tidak|tak|ga)\s+(disuruh|diminta|diarahkan|disarankan)\s+(me)?beli/.test(c)) put("directed_outside_purchase", "no", raw, hedged);
    // pembelian nyata: butuh penanda kejadian ("saya beli", "akhirnya beli", "dibeli sendiri"); "disuruh beli" saja BUKAN pembelian
    if (/\b(belum|tidak|tak|ga)\s+(sempat\s+)?(saya\s+)?(me)?(beli|tebus|menebus)\b|tidak jadi (me)?beli/.test(c)) put("outside_purchase", "no", raw, hedged);
    else if (/\b(saya|akhirnya|terpaksa|jadi|sudah|lalu|terus)\s+(me)?(beli|menebus|tebus)\b|\bdibeli (sendiri|di luar|di apotek)\b|\b(beli|membeli|tebus) sendiri\b|\bsudah (beli|membeli|ditebus)\b/.test(c)) put("outside_purchase", "yes", raw, hedged);
    if (/\b(sendiri|saya|akhirnya)\b.*\b(bayar|membayar|dibayar|biaya|uang)\b|\b(bayar|membayar|dibayar)\b.*\b(sendiri|rp|ribu|juta)\b|rp ?\d|\b\d+ ?(ribu|rb|juta|jt)\b|uang (saya|sendiri)|keluar uang|dari kantong/.test(c) && !/\b(tidak|belum)\s+(bayar|membayar)\b/.test(c)) put("out_of_pocket_paid", "yes", raw, hedged);
    else if (/\b(tidak|belum|ga)\s+(bayar|membayar)\b|\bgratis\b/.test(c)) put("out_of_pocket_paid", "no", raw, hedged);
    if (allowed.has("reported_reason")) {
      if (/\b(tidak|bukan|ga)\s+(di)?(tanggung|ditanggung|cover|dicover)\b|di luar (tanggungan|paket|plafon|formularium)|tidak masuk (formularium|daftar|tanggungan|paket)|non (bpjs|fornas)/.test(c)) put("reported_reason", "not_covered", raw, hedged);
      else if (/\b(stok|stock|persediaan)\b|\b(kosong|habis|belum datang|menipis)\b/.test(c)) put("reported_reason", "stock_out", raw, hedged);
      else if (/\b(tidak|ga|belum)\s+(ada\s+)?(alasan|dijelaskan|diberi tahu|dikasih tahu|menjelaskan|dikasih alasan)\b|tanpa alasan|tidak ditanyakan/.test(c)) put("reported_reason", "no_reason_given", raw, hedged);
      else if (/\balasan (lain|lainnya)\b/.test(c)) put("reported_reason", "other", raw, hedged);
    }

    for (const r of YN_RULES) {
      if (!r.slots.some((s) => allowed.has(s)) || !r.topic.test(c)) continue;
      const no = (r.no ?? NEG).test(c);
      const yes = (r.yes ?? POS).test(c);
      const v = no ? "no" : yes ? "yes" : null;
      if (!v) continue;
      for (const s of r.slots) if (allowed.has(s) && !(s === "replacement_arranged" && out.has(s))) put(s, v, raw, hedged);
    }
  }
  if (ignoredInstruction) uncertainties.push("instruction_like_text_ignored");

  // jawaban untuk pertanyaan terakhir: meta (lupa/tidak paham) dan polaritas singkat
  const whole = norm(answer);
  if (target && allowed.has(target) && !out.has(target) && !isInstructionLike(answer)) {
    const vals = allowed.get(target)!;
    if (/^(saya )?(lupa|tidak ingat|tidak yakin|tidak tahu|kurang tahu|kurang yakin|entah|lupa lupa ingat|agak lupa)\b/.test(whole) || /\b(lupa|tidak ingat|tidak tahu)\b/.test(whole) && whole.split(" ").length <= 6) {
      if (vals.includes("unknown")) put(target, "unknown", firstClause(answer), false);
    } else if (/\b(tidak paham|tidak mengerti|bingung|maksudnya apa|apa maksud|tidak ngerti)\b/.test(whole)) {
      if (vals.includes("not_understood")) put(target, "not_understood", firstClause(answer), false);
    } else if (whole.split(" ").length <= 8 && vals.includes("yes") && vals.includes("no")) {
      if (/^(tidak|belum|bukan|tidak pernah|tidak ada)\b/.test(whole)) put(target, "no", firstClause(answer), HEDGE.test(whole));
      else if (/^(ya|iya|betul|benar|pernah|ada|sudah|dapat|dikasih|diberi|tentu)\b/.test(whole)) put(target, "yes", firstClause(answer), HEDGE.test(whole));
    }
  }
  // "tidak berlaku" untuk slot sasaran
  if (target && allowed.has(target) && !out.has(target) && /\b(tidak berlaku|tidak relevan|bukan untuk saya)\b/.test(whole) && allowed.get(target)!.includes("not_applicable")) put(target, "not_applicable", firstClause(answer), false);

  const items = [...out.values()];
  if (out.has("directed_outside_purchase") && out.get("directed_outside_purchase")!.value === "yes" && allowed.has("outside_purchase") && !out.has("outside_purchase")) uncertainties.push("outside_purchase_not_yet_confirmed");
  for (const i of items) if (i.hedged) uncertainties.push(`hedged:${i.slot}`);
  return { items, uncertainties: [...new Set(uncertainties)].slice(0, 8), needsHelp: urgentSignal(answer) };
}

function firstClause(text: string) {
  return (clauses(text)[0] ?? text).slice(0, 400);
}
