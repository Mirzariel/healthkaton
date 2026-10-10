import Anthropic from "@anthropic-ai/sdk";
import type { AiConfig } from "../ai/invocations";
import type { EvidencePack } from "./pack";
import { ASSISTANT_LIMITS } from "./labels";
import { SUGGESTION_KINDS, liveSummaryZ, type SummaryContent } from "./summary";

/* Penyusun ringkasan berbasis model bahasa. Hanya dipanggil bila kunci tersedia di lingkungan server.
   Paket bukti diminimalkan: tanpa identitas peserta, tanpa nama faskes. Keluaran WAJIB lolos skema ketat dan validator rujukan
   (summary.ts); bila tidak, pemanggil jatuh ke penyusun aturan dan mencatat fallback. */

const SYSTEM = `Anda menyusun DRAF ringkasan bukti untuk petugas pengelola kasus layanan kesehatan JKN. Petugas yang memutuskan; Anda hanya merapikan informasi.

Aturan keras:
- Gunakan hanya fakta pada paket bukti. Jangan menambah informasi, angka, nama, atau tanggal.
- Setiap pernyataan pada bagian participant, supporting, contradicting, dan contradictions wajib membawa refs yang menunjuk ke id yang ada pada paket (type dan id persis).
- Jangan menyatakan layanan terbukti/tidak terbukti, ada kecurangan, siapa bersalah, sanksi, nilai pembayaran, penyebab, diagnosis, atau resep. Jangan memakai kata "fraud", "kecurangan", "bersalah", "sanksi", "denda".
- Jawaban peserta bernilai "lupa" atau "tidak paham" bernilai nol: bukan bukti ada ataupun tidak ada.
- Dokumen yang belum ditemukan tidak berarti layanan tidak dilakukan.
- Bagian supporting dan contradicting hanya berisi bukti yang sudah ditautkan petugas (links). Bagian facility merangkum jawaban faskes tanpa menilainya.
- steps adalah saran langkah berikutnya bagi petugas (kind: ${SUGGESTION_KINDS.join(", ")}). Saran tidak dieksekusi otomatis. Tulis kalimat klarifikasi untuk faskes dengan nada netral dan sopan.
- Tulis dalam bahasa Indonesia yang lugas.

Keluarkan HANYA satu objek JSON tanpa teks lain, dengan kunci: participant, basis, facility, supporting, contradicting, contradictions, missing (masing-masing larik {id, text, refs:[{type,id,label,quote?}]}), dan steps (larik {kind, text, refs, payload:{issue?, requestedDocs?, minimalRef?, source?, query?, question?, serviceId?}}). Nilai id blok berupa string pendek unik, mis. "p1", "b2".`;

/** Paket yang dikirim ke model: hanya bidang yang diperlukan untuk merangkum. */
export function minimizePack(pack: EvidencePack) {
  const t = (s: string | null | undefined, n: number) => (s ? (s.length > n ? s.slice(0, n) : s) : null);
  return {
    finding: { id: pack.finding.id, type: pack.finding.type, title: pack.finding.title, proof_status: pack.finding.proof_status },
    signals: pack.signals.map((s) => s.label),
    indicator: pack.indicator ? { id: pack.indicator.version_id, title: pack.indicator.title } : null,
    episode: { id: pack.episode.id, kind: pack.episode.kind, admit_at: pack.episode.admit_at, discharge_at: pack.episode.discharge_at },
    claim: pack.claim ? { id: pack.claim.id, claim_no: pack.claim.claim_no } : null,
    services: pack.services.map((s) => ({ id: s.id, code: s.code, name: s.name, performed_at: s.performed_at, needs_record: s.needs_record, state: s.state, reasons: s.reasons })),
    records: pack.records.map((r) => ({ id: r.id, service_id: r.service_id, type: r.type, recorded_at: r.recorded_at, summary: t(r.summary, 200) })),
    participant_facts: pack.facts.map((x) => ({ id: x.id, stage: x.stage, slot: x.slot, subject: x.subject, value: x.value, status: x.status, zero_value: x.meta, quote: t(x.quote, 200), respondent: x.respondent_role })),
    participant_reports: pack.requests.map((r) => ({ id: r.id, category: r.category, text: t(r.text, 300) })),
    clarifications: pack.clarifications.map((c) => ({ id: c.id, status: c.status, due_at: c.due_at, issue: t(c.issue, 300), response: t(c.response_text, 500) })),
    linked_evidence: pack.links.map((l) => ({ id: l.id, direction: l.direction, quote: t(l.quote, 200), note: t(l.note, 200) })),
    documents: pack.documents.map((d) => ({ id: d.id, name: d.name, status: d.processing_status, excerpt: t(d.extraction?.excerpt, 300) })),
    searches: pack.searches.map((s) => ({ id: s.id, source: s.source, query: s.query, result: s.result })),
  };
}

export async function summarizeWithModel(pack: EvidencePack, cfg: AiConfig) {
  const client = new Anthropic({ maxRetries: 0 });
  const started = Date.now();
  const res = await client.messages.create(
    {
      model: cfg.model,
      max_tokens: 4000,
      system: SYSTEM,
      messages: [{ role: "user", content: `Paket bukti (JSON):\n${JSON.stringify(minimizePack(pack))}\n\nSusun ringkasan sesuai aturan.` }],
    },
    { timeout: cfg.timeout_ms },
  );
  const latency_ms = Date.now() - started;
  if (res.stop_reason === "refusal" || res.stop_reason === "max_tokens") throw Object.assign(new Error(`stop_reason=${res.stop_reason}`), { name: "ModelStop" });
  const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw Object.assign(new Error("keluaran bukan JSON"), { name: "ParseError" });
  let raw: unknown;
  try { raw = JSON.parse(text.slice(start, end + 1)); } catch { throw Object.assign(new Error("JSON tidak valid"), { name: "ParseError" }); }
  const parsed = liveSummaryZ.safeParse(raw);
  if (!parsed.success) throw Object.assign(new Error(`skema ditolak: ${parsed.error.issues.slice(0, 2).map((i) => i.path.join(".")).join(", ")}`), { name: "SchemaError" });
  const content: SummaryContent = { ...parsed.data, limits: [...ASSISTANT_LIMITS] };
  return {
    content,
    provider: "anthropic",
    model: res.model ?? cfg.model,
    // Biaya tidak dihitung: tarif tidak dikonfigurasi pada sistem ini, sehingga dicatat sebagai tidak tersedia.
    usage: { tokens_in: res.usage?.input_tokens, tokens_out: res.usage?.output_tokens },
    latency_ms,
  };
}
