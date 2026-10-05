# Autopilot Keputusan: dari simulasi ke AI sungguhan

Dokumen ini menjelaskan apa yang sudah ada sekarang dan langkah persis untuk menggantinya dengan AI sungguhan saat peluncuran. Tujuannya agar tim tidak perlu merancang ulang dari nol.

---

## 1. Kondisi sekarang (prototipe)

| Bagian | Lokasi | Keterangan |
|---|---|---|
| Mesin keputusan | `src/lib/autopilot.ts` → `proposeDecision()` | **Berbasis aturan (simulasi), bukan model AI.** Memakai skor dan sinyal dari `src/lib/engine`. |
| Eksekusi otomatis | `runAutopilot()` | Memutus semua kasus terbuka. Kasus *phantom billing* tanpa jawaban peserta tidak diputus, melainkan ditandai **menunggu konfirmasi peserta**. |
| Pemicu | `api/autopilot/mode`, `api/patient/confirm`, `api/import` | Menyalakan mode otomatis langsung memproses antrean. Selama mode aktif, jawaban peserta dan impor CSV memicu keputusan baru. |
| Tinjauan manusia | `confirmAuto` / `overrideAuto` / `reopenAuto`, `api/cases/[id]/auto` | Petugas dapat **mengonfirmasi**, **mengubah**, atau **mengembalikan** keputusan ke antrean manual. |
| Jejak | tabel `auto_decisions` + `audit_log` | Setiap keputusan otomatis tercatat di rantai hash dengan pelaku `otomatis`, keyakinan, dan alasan. |
| Kendali mutu | `REVIEW_CONFIDENCE = 70` + sampel acak 1/10 | Keputusan berkeyakinan rendah dan sampel acak masuk daftar "perlu ditinjau". |
| Tes | `tests/autopilot/autopilot.test.ts` | Mode, keputusan, alur konfirmasi peserta, tinjauan, dan keutuhan rantai hash. |

Hasil pada data contoh: 54 kasus diproses dalam ±0,2 detik. 45 diputus, 9 menunggu peserta, dan semua 9 kasus sah yang mirip kecurangan diloloskan. **Angka ini membuktikan alurnya berjalan, bukan akurasi di dunia nyata.** Data contoh dibuat bersama aturannya.

Kebijakan yang dipilih pemilik produk: **semua keputusan otomatis**, termasuk menolak dan mengoreksi klaim. Manusia meninjau belakangan dan bisa membatalkan.

---

## 2. Arsitektur target dengan AI

```
Klaim + bukti + jawaban peserta
        │
        ▼
 Mesin aturan (src/lib/engine) ── skor, sinyal, batas kesimpulan   ← tetap dipakai sebagai "lantai"
        │
        ▼
 Penalar AI (Claude) ── keputusan + nilai koreksi + keyakinan + alasan + dasar
        │
        ▼
 Pagar pengaman (kode, bukan AI) ── validasi skema, batas nilai, aturan wajib tinjau
        │
        ▼
 runAutopilot() → cases + auto_decisions + audit_log   (tidak berubah)
```

Yang perlu diganti **hanya `proposeDecision()`**. Bentuk keluarannya (`Verdict`) sudah sama dengan yang akan diminta dari AI, jadi UI, API, audit, dan tinjauan tidak perlu disentuh.

### Langkah implementasi

1. `npm install @anthropic-ai/sdk zod`
2. Buat `src/lib/reasoner/claude.ts` yang mengembalikan `Verdict` (contoh di bawah).
3. Di `proposeDecision()`: jalankan mesin aturan dulu, lalu panggil penalar AI dengan hasil mesin + bukti. **Jika AI gagal, menolak, atau melanggar pagar, pakai keputusan mesin aturan** dan turunkan keyakinan agar masuk daftar tinjau.
4. Ganti `ENGINE_LABEL` menjadi nama model + versi prompt, misalnya `claude-opus-5-5 · kebijakan v1`, agar setiap keputusan di audit bisa ditelusuri ke versi yang membuatnya.
5. Tambah env var: `SEHATI_REASONER=rules|claude` (default `rules`) supaya bisa dimatikan seketika tanpa deploy ulang.

### Contoh kode penalar (TypeScript, SDK resmi)

```ts
// src/lib/reasoner/claude.ts
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

const VerdictSchema = z.object({
  decision: z.enum(["loloskan", "koreksi", "tolak", "eskalasi"]),
  correction: z.number().int().nonnegative().nullable(), // rupiah yang dipotong; null bila bukan koreksi
  confidence: z.number().int().min(0).max(100),
  summary: z.string(),      // satu kalimat untuk petugas
  basis: z.array(z.string()), // dasar keputusan, poin per poin, merujuk bukti
});

const client = new Anthropic(); // kunci dari ANTHROPIC_API_KEY

// Kebijakan verifikasi (statis, panjang) → di-cache agar murah dan cepat.
const POLICY = `Anda adalah verifikator klaim JKN. Putuskan berdasarkan bukti yang diberikan saja.
Aturan: ... (salin pedoman verifikasi resmi, definisi modus, batas kesimpulan, contoh keputusan) ...`;

export async function reasonWithClaude(caseBundle: unknown) {
  const res = await client.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    output_config: { effort: "medium", format: zodOutputFormat(VerdictSchema) },
    system: [{ type: "text", text: POLICY, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: JSON.stringify(caseBundle) }],
  });
  if (res.stop_reason === "refusal" || !res.parsed_output) return null; // → pakai mesin aturan
  return res.parsed_output;
}
```

Catatan teknis:
- **Model:** `claude-opus-5-5` sebagai titik awal. Setelah ada set evaluasi (langkah 4), uji `claude-sonnet-5-5` atau tingkat `effort` yang lebih rendah untuk menekan biaya, lalu pilih yang mutunya tetap memenuhi standar.
- **Keluaran terstruktur** (`messages.parse` + Zod) menjamin bentuk JSON. Isinya tetap harus divalidasi pagar pengaman.
- **Prompt caching:** taruh kebijakan statis di `system` dengan `cache_control`. Data kasus yang berubah-ubah selalu diletakkan di `messages`.
- **Volume besar dan tidak mendesak:** pakai Message Batches API (biaya lebih rendah, hasil asinkron) untuk pemrosesan antrean malam hari.
- **Fallback saat model menolak:** API menyediakan parameter `fallbacks` (beta) untuk mencoba model lain secara otomatis. Di SEHATI, fallback paling aman adalah kembali ke mesin aturan.

---

## 3. Pagar pengaman (wajib, ditulis dalam kode)

AI boleh salah. Aturan berikut tidak boleh dilanggar apa pun jawaban AI:

- `correction` tidak boleh melebihi nilai klaim, dan untuk *phantom* tidak boleh melebihi jumlah nilai layanan yang tidak berbukti.
- Keputusan **tolak/koreksi** harus menyebut minimal satu sinyal dari mesin aturan di `basis`. Jika tidak, turunkan ke `eskalasi`.
- Ketidaksepakatan AI dengan mesin aturan (misalnya mesin bilang indikasi kuat tapi AI meloloskan) → otomatis masuk daftar tinjau.
- Nilai di atas ambang tertentu (misalnya > Rp50 juta) → wajib ditinjau manusia sebelum berlaku.
- Jawaban peserta adalah **sinyal, bukan bukti tunggal**. Jangan pernah menolak hanya karena satu jawaban.
- Setiap keputusan menyimpan model, versi prompt, keyakinan, dan alasan di `audit_log`.

---

## 4. Sebelum peluncuran

1. **Set evaluasi:** kumpulkan ratusan kasus historis yang sudah diputus verifikator berpengalaman (dianonimkan). Ukur kecocokan keputusan, salah tolak (merugikan RS), dan salah loloskan (merugikan JKN).
2. **Mode bayangan (*shadow mode*):** AI memutus diam-diam, manusia tetap memutus seperti biasa. Bandingkan selama beberapa minggu.
3. **Pilot terbatas:** satu wilayah atau satu jenis klaim. Mulai dengan otomatis hanya untuk jalur "loloskan", lalu perluas ke koreksi/tolak setelah angka salah-keputusan memenuhi target.
4. **Pemantauan berjalan:** tingkat pembatalan oleh petugas per minggu, sebaran keyakinan, dan hasil sampel acak. Jika tingkat pembatalan naik, otomatis kembali ke mode manual.

---

## 5. Data, hukum, dan keamanan

- **Pelindungan data pribadi (UU No. 27/2022 tentang PDP):** data klaim dan rekam medis adalah data pribadi spesifik. Perlu dasar hukum pemrosesan, perjanjian pemrosesan data dengan penyedia AI, dan penilaian dampak (DPIA).
- **Minimalkan data yang dikirim:** kirim ID samaran, bukan nama/NIK. Kirim ringkasan layanan dan bukti, bukan dokumen utuh, bila cukup.
- **Lokasi pemrosesan:** jika data harus diproses di wilayah tertentu, Claude tersedia lewat Amazon Bedrock dan Google Cloud Vertex AI dengan pilihan region. Periksa ketersediaan model di region yang dibutuhkan saat itu. SDK memiliki klien khusus: `AnthropicBedrockMantle` (`@anthropic-ai/bedrock-sdk`) dan `AnthropicVertex` (`@anthropic-ai/vertex-sdk`).
- **Hak keberatan:** rumah sakit harus bisa mengajukan keberatan atas keputusan otomatis dan mendapat penjelasan. Kolom `summary` + `basis` sudah disiapkan untuk itu.
- **Kunci API** hanya di variabel lingkungan atau *secret manager*, tidak pernah di repo.

---

## 6. Ringkasan untuk pengambil keputusan

| | Sekarang (prototipe) | Saat peluncuran |
|---|---|---|
| Penalar | Aturan (simulasi) | Claude + aturan sebagai pengaman |
| Biaya per kasus | Nol | Biaya token API (turun dengan caching dan batch) |
| Kecepatan | Instan | Detik per kasus, antrean bisa diproses paralel |
| Bisa diaudit | Ya (rantai hash) | Ya + versi model dan prompt |
| Manusia | Meninjau setelahnya | Sama, ditambah *shadow mode* dan pilot sebelum penuh |
