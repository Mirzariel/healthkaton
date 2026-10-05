# Skrip demo (5–6 menit)

Persiapan: `npm run dev`, lalu tekan **Atur ulang data demo** (di konsol atau di `/m`). Buka `/` di satu tab dan `/console` di tab lain. Mode keputusan mulai dari **Manual**.

| Menit | Layar | Yang dikatakan | Yang diperlihatkan |
|---|---|---|---|
| 0:00 | `/` | "Satu perawatan, tiga tagihan." | Hero, lalu "Apa itu SEHATI" dan Cara kerja |
| 0:45 | `/` bab Tiga tagihan | "Satu per satu wajar. Dalam satu garis waktu, masalahnya terlihat." | Garis waktu bertanggal, tiga baris tagihan, ringkasan 1 vs 3 klaim |
| 1:30 | `/console` | "Ini daftar kerja petugas. Yang paling mendesak di atas." | Panduan halaman, meter risiko, kode yang bisa diklik untuk penjelasan |
| 2:00 | `/console` → sakelar **Otomatis** | "Yang rutin tidak perlu dibaca manusia." | "45 kasus diputus dalam 0,2 detik · 9 menunggu peserta · 15 perlu ditinjau" |
| 2:45 | `/console/cases/KS-0003` | "Bukti kurang bukan berarti tidak dilakukan, jadi mesin bertanya dulu ke peserta." | Kartu "Menunggu konfirmasi peserta" |
| 3:15 | `/m` | "Peserta jadi saksi." | Mulai, lalu jawab "TIDAK pernah" untuk Bronkoskopi |
| 3:45 | `/console/cases/KS-0003` | "Jawaban masuk, kasus langsung diputus, lengkap dengan alasannya." | Dikoreksi Rp3,2 jt, keyakinan, dasar keputusan, lalu tekan **Setujui** |
| 4:30 | `/console/autopilot` | "Manusia tetap memegang kendali." | Daftar "Perlu ditinjau", ubah atau kembalikan keputusan |
| 5:00 | `/console/audit` | "Tidak bisa diubah diam-diam." | Kalimat "Mesin otomatis …", rantai hash utuh |
| 5:30 | `/console/metrics` | "Angka ini dari data contoh." | Tertangkap, tepat, sah terlindungi, dan batasnya |

Pertanyaan yang mungkin muncul:
- *Pakai data peserta asli?* Tidak. Seluruhnya data contoh.
- *AI memutus sendiri, bagaimana kalau salah?* Keputusan berkeyakinan rendah dan sampel acak selalu ditinjau manusia. Setiap keputusan bisa dibatalkan dan tercatat di rantai hash. Rumah sakit tetap bisa mengajukan keberatan.
- *Sudah AI sungguhan?* Belum. Prototipe memakai mesin aturan. Jalur ke Claude sudah dirancang di `docs/AI-AUTOPILOT.md`: cukup ganti satu fungsi, dengan pagar pengaman dan *shadow mode* sebelum rilis.
- *Bagaimana dengan akurasi?* Diukur pada data contoh. Dampak nyata butuh pilot.
