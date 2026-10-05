/** Kamus istilah: satu sumber penjelasan bahasa awam untuk semua kode & jargon di aplikasi.
 *  Dipakai oleh <Term> dan <CodeTag> (components/explain.tsx). */
export interface GlossaryEntry {
  /** Nama yang ramah dibaca. */
  title: string;
  /** Satu-dua kalimat, tanpa jargon. */
  body: string;
  /** Contoh format bila istilahnya berupa kode. */
  example?: string;
}

export const GLOSSARY = {
  // --- Nomor & kode ---
  kasus: { title: "Nomor kasus", body: "Nomor urut berkas pemeriksaan yang dibuka SEHATI saat menemukan kejanggalan. Satu kasus = satu klaim yang perlu dicek petugas.", example: "KS-0003" },
  klaim: { title: "Nomor klaim", body: "Nomor tagihan yang dikirim rumah sakit ke BPJS untuk satu perawatan. Format: KLM-tahun-urutan.", example: "KLM-2026-001777" },
  layanan: { title: "Kode layanan", body: "Singkatan untuk satu tindakan medis yang ditagihkan, misalnya BRONKO = bronkoskopi, LAB-DL = periksa darah. Katalog ini simulasi.", example: "BRONKO, RONTGEN, LAB-DL" },
  diagnosis: { title: "Kode diagnosis", body: "Kode penyakit (gaya ICD-10) yang ditulis dokter, misalnya J18.9 = pneumonia. Di prototipe ini kodenya simulasi.", example: "J18.9" },
  peserta: { title: "ID peserta", body: "Nomor pengenal peserta JKN di data simulasi. Bukan NIK atau nomor kartu sungguhan.", example: "P-0001" },
  temuan: { title: "Nomor temuan", body: "Satu kejanggalan spesifik yang ditemukan mesin di dalam sebuah kasus.", example: "F-0001" },

  // --- Modus kecurangan ---
  phantom: { title: "Phantom billing (tagihan fiktif)", body: "Tindakan ditagihkan, tetapi tidak ada bukti tindakan itu benar-benar dilakukan. SEHATI mencocokkan tagihan dengan lembar tindakan dan jawaban peserta." },
  repeat_billing: { title: "Repeat billing (tagihan ganda)", body: "Perawatan yang sama ditagihkan lebih dari sekali, misalnya dua klaim dengan pasien, tanggal, dan nilai yang sama persis." },
  fragmentation: { title: "Pemecahan episode", body: "Satu rangkaian perawatan dipecah menjadi beberapa klaim terpisah (misalnya pasien \"pulang\" lalu \"masuk lagi\" di hari yang sama) agar tagihannya lebih besar." },

  // --- Konsep ---
  episode: { title: "Episode", body: "Satu rangkaian perawatan pasien dari masuk sampai pulang. SEHATI menyatukan semua klaim ke episode-nya agar tagihan ganda atau terpecah terlihat." },
  skor: { title: "Skor indikasi (0–100)", body: "Seberapa kuat tanda-tanda kejanggalan. 70+ = indikasi kuat, 50–69 = sedang, di bawah 50 = lemah. Ini bukan vonis — keputusan tetap di tangan petugas." },
  risiko: { title: "Tingkat risiko", body: "Ringkasan skor: Tinggi (≥70), Sedang (50–69), Rendah (<50). Antrean diurutkan dari yang lewat tenggat dan berisiko tertinggi." },
  tenggat: { title: "Tenggat", body: "Batas waktu kasus harus diputuskan. Merah berarti sudah lewat." },
  bukti: { title: "Status bukti", body: "Tersedia = ada dokumen yang cocok. Kurang = dokumennya belum ada. Bertentangan = dokumen ada tapi isinya tidak cocok dengan tagihan." },
  konfirmasi: { title: "Konfirmasi peserta", body: "Jawaban pasien lewat aplikasi (konsep fitur JKN Mobile): apakah tindakan itu benar ia terima. Jawaban ini jadi satu bukti tambahan, bukan putusan." },
  batas: { title: "Batas kesimpulan", body: "Hal yang TIDAK boleh disimpulkan dari temuan ini. Mencegah petugas menuduh tanpa dasar." },
  praPengajuan: { title: "Pra-pengajuan", body: "Pemeriksaan klaim yang masih draft, sebelum dikirim rumah sakit. Masalah bisa diperbaiki lebih awal, sebelum jadi sengketa." },
  tahap: { title: "Enam tahap pemeriksaan", body: "Kepesertaan → Dokumentasi → Koding → Penyusunan klaim → Verifikasi → Audit. Setiap tahap diberi status: sesuai, perlu dicek, bermasalah, atau menunggu." },

  // --- Peran ---
  casemix: { title: "Casemix (rumah sakit)", body: "Petugas rumah sakit yang menyusun klaim. Di SEHATI ia menjawab permintaan klarifikasi dan melampirkan dokumen." },
  verifikator: { title: "Verifikator (BPJS)", body: "Petugas BPJS yang memeriksa klaim dan memutuskan: loloskan, koreksi nilai, tolak, atau eskalasi." },
  auditor: { title: "Auditor", body: "Petugas yang menangani kasus eskalasi dan memeriksa ulang keputusan." },
  dokter: { title: "Dokter", body: "Memberi catatan medis bila petugas butuh pendapat klinis." },

  // --- Konsol petugas (peran demo, keputusan, pra-pengajuan) ---
  peranDemo: { title: "Ganti peran (khusus demo)", body: "Bukan login sungguhan. Di prototipe ini Anda bisa berganti peran kapan saja untuk melihat apa yang bisa dan tidak bisa dilakukan tiap petugas. Di aplikasi nyata, peran ditentukan oleh akun masing-masing." },
  jenisDugaan: { title: "Jenis dugaan", body: "Tiga pola kejanggalan yang dicari SEHATI: tagihan fiktif (tindakan tidak terbukti), tagihan ganda (ditagih berulang), dan perawatan dipecah (satu perawatan dijadikan beberapa klaim). Semuanya baru dugaan, belum terbukti." },
  statusKasus: { title: "Status kasus", body: "Baru = belum ditinjau. Menunggu RS = petugas sudah meminta klarifikasi. Selesai = sudah diputuskan." },
  keputusan: { title: "Empat pilihan keputusan", body: "Loloskan = klaim sah, dibayar penuh. Koreksi nilai = sebagian nilai dikurangi. Tolak = tidak layak dibayar. Eskalasi = diteruskan ke audit lanjutan. Setelah dicatat, keputusan tidak bisa diubah." },
  klarifikasi: { title: "Klarifikasi", body: "Percakapan antara petugas BPJS dan rumah sakit untuk meminta penjelasan atau dokumen sebelum kasus diputuskan." },
  klaimPembanding: { title: "Klaim pembanding", body: "Klaim lain yang mirip dengan klaim ini. Dibandingkan untuk menilai apakah benar ada penagihan ganda atau pemecahan." },
  dasarSkor: { title: "Dasar skor", body: "Daftar tanda yang menaikkan (+) atau menurunkan (−) skor. Angka hijau berarti tanda yang meringankan." },
  verdictPra: { title: "Hasil pemeriksaan draft", body: "Tahan = sebaiknya jangan dikirim dulu, ada masalah serius. Periksa dulu = ada hal yang perlu dicek. Siap dikirim = tidak ditemukan masalah." },
  penugasan: { title: "Penugasan", body: "Menentukan siapa yang bertanggung jawab menangani kasus ini berikutnya, supaya tidak ada kasus yang terlupakan." },
  nilaiKlaim: { title: "Nilai klaim", body: "Total yang ditagihkan rumah sakit untuk klaim ini, dalam rupiah. Nilai berisiko = jumlah klaim pada kasus yang belum diputuskan." },

  // --- Audit & metrik ---
  hash: { title: "Sidik jari digital (hash)", body: "Kode unik yang dihitung dari isi catatan. Kalau isi catatan diubah sedikit saja, kodenya berubah total — jadi perubahan diam-diam langsung ketahuan." },
  rantai: { title: "Rantai hash", body: "Setiap catatan menyimpan sidik jari catatan sebelumnya, seperti mata rantai. Satu catatan diubah = rantai putus = terdeteksi." },
  recall: { title: "Tertangkap (recall)", body: "Dari semua kasus bermasalah yang sebenarnya, berapa persen yang berhasil ditandai SEHATI." },
  presisi: { title: "Tepat (presisi)", body: "Dari semua yang ditandai SEHATI, berapa persen yang memang bermasalah. Makin tinggi, makin sedikit alarm palsu." },
  sahTerlindungi: { title: "Sah terlindungi", body: "Kasus yang sengaja dibuat mirip bermasalah padahal sah. Diukur apakah SEHATI tidak salah menuduhnya." },
  autopilot: { title: "Autopilot keputusan", body: "Mode di mana SEHATI memutus kasus sendiri (loloskan, koreksi, tolak) memakai aturan pemeriksaan. Setiap keputusan tercatat di jejak audit dan bisa disetujui, diubah, atau dibatalkan petugas. Versi prototipe memakai mesin aturan (simulasi), belum model AI." },
  keyakinan: { title: "Keyakinan keputusan", body: "Seberapa kuat dasar keputusan otomatis (0–100%). Di bawah 70% keputusan selalu ditandai untuk ditinjau petugas. Selain itu, 1 dari 10 keputusan dipilih acak untuk diperiksa manusia." },
  tinjauOtomatis: { title: "Tinjauan keputusan otomatis", body: "Petugas memeriksa keputusan yang dibuat autopilot: menyetujui, mengubah, atau mengembalikannya ke antrean manual. Semua tindakan ini tercatat." },
  csv: { title: "Berkas CSV", body: "Tabel sederhana (bisa dibuat dari Excel: Simpan sebagai → CSV). Satu baris = satu layanan yang ditagihkan." },
} as const satisfies Record<string, GlossaryEntry>;

export type GlossaryKey = keyof typeof GLOSSARY;
