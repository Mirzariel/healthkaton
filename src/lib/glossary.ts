/** Kamus istilah: satu sumber penjelasan bahasa awam untuk kode dan istilah di aplikasi. Dipakai oleh <Term>, <CodeTag>, <InfoDot>. */
export interface GlossaryEntry {
  title: string;
  body: string;
  example?: string;
}

export const GLOSSARY = {
  kasus: { title: "Nomor kasus", body: "Berkas kerja petugas untuk satu episode perawatan. Satu kasus dapat memuat beberapa temuan.", example: "KS-0003" },
  temuan: { title: "Nomor temuan", body: "Satu hal spesifik yang perlu dibuktikan atau ditindaklanjuti di dalam kasus.", example: "F-0001" },
  klaim: { title: "Nomor klaim", body: "Nomor tagihan faskes untuk satu perawatan. Pada data demo ini sepenuhnya sintetis.", example: "KLM-2026-001777" },
  episode: { title: "Episode", body: "Satu rangkaian perawatan peserta, dari masuk sampai pulang. Semua klaim, dokumen, survei, dan kasus dikaitkan ke episode agar tidak terpecah-pecah." },
  layanan: { title: "Kode layanan", body: "Singkatan satu tindakan atau layanan pada rincian tagihan. Katalog di demo ini simulasi, bukan kode resmi.", example: "BRONKO, RONTGEN, LAB-DL" },
  sinyal: { title: "Sinyal", body: "Tanda yang perlu diperiksa, dari jawaban peserta atau dari pencocokan data. Sinyal BUKAN bukti dan bukan putusan." },
  skor: { title: "Kekuatan sinyal (0–100)", body: "Seberapa kuat tanda-tanda yang terkumpul. Hanya untuk mengurutkan antrean pemeriksaan. Tidak dipakai untuk menahan klaim atau menilai faskes secara otomatis." },
  pembuktian: { title: "Status pembuktian", body: "Sinyal → Sedang ditinjau → Menunggu klarifikasi → Terbukti / Tidak terbukti / Tidak dapat dibuktikan. Status akhir butuh usulan verifikator dan persetujuan reviewer." },
  tindakan: { title: "Status tindakan perbaikan", body: "Terpisah dari pembuktian. Satu masalah dapat sudah terbukti tetapi perbaikannya belum dikerjakan." },
  penyebab: { title: "Analisis penyebab", body: "Baru terbuka setelah temuan terbukti. Boleh lebih dari satu kategori (administratif, proses pelayanan). Dugaan fraud hanya lewat jalur eskalasi dua persetujuan, dan tetap berupa dugaan." },
  hakJawab: { title: "Hak jawab faskes", body: "Faskes diberi kesempatan menjawab dan melampirkan bukti sebelum temuan dinyatakan terbukti. Tenggat yang lewat memenuhi hak jawab tetapi tidak membuktikan apa pun." },
  klarifikasi: { title: "Klarifikasi", body: "Permintaan tertulis petugas kepada faskes untuk penjelasan atau dokumen, dengan tenggat. Keterlambatan dicatat terpisah." },
  standar: { title: "Standar berversi", body: "Kumpulan butir pelayanan yang ditanyakan ke peserta. Setiap butir punya sumber, versi, cakupan, kondisi penerapan, dan pemilik validasi. AI tidak membuat kewajiban baru." },
  draft: { title: "Draf menunggu validasi", body: "Butir disusun tim dan belum divalidasi pemilik proses (dr. Yuli). Boleh dipakai demo dengan label, bukan dasar klaim kepatuhan resmi." },
  approved: { title: "Disetujui di aplikasi", body: "Hanya mencatat hasil review tim SEHATI. Bukan pengesahan kebijakan BPJS Kesehatan atau Kemenkes." },
  applicability: { title: "Kondisi penerapan", body: "Aturan data yang menentukan apakah butir berlaku untuk episode ini, mis. hanya bila ada resep pulang. Bila fakta belum diketahui, sistem bertanya, tidak langsung menganggap tidak berlaku." },
  slot: { title: "Slot", body: "Satu fakta yang diukur oleh sebuah butir, mis. 'obat diterima: semua/sebagian/tidak'. Satu pertanyaan mengukur satu slot." },
  observable: { title: "Dapat diamati peserta", body: "Peserta hanya ditanya hal yang bisa mereka lihat atau alami, bukan ketepatan diagnosis atau kelengkapan koding." },
  simulasi: { title: "Data/mesin simulasi", body: "Sumber ini sintetis atau penafsir berbasis aturan. Bukan koneksi produksi BPJS dan bukan inferensi AI sungguhan." },
  hash: { title: "Sidik jari digital (hash)", body: "Kode yang dihitung dari isi catatan. Isi berubah sedikit saja, kodenya berubah total." },
  rantai: { title: "Rantai hash", body: "Setiap catatan menyimpan hash catatan sebelumnya. Mengubah satu catatan memutus rantai sehingga terdeteksi. Ini MENDETEKSI, bukan mencegah: orang dengan akses penuh ke berkas basis data dapat menulis ulang seluruh rantai." },
  jangkar: { title: "Jangkar (anchor)", body: "Hash kepala rantai yang dicatat terpisah (opsional bertanda tangan HMAC bila rahasia server diatur). Jangkar di basis data yang sama bukan trust anchor independen; salinkan keluar untuk perlindungan nyata." },
  peranDemo: { title: "Ganti peran (khusus demo)", body: "Bukan login sungguhan. Di demo data sintetis Anda dapat berganti peran untuk melihat apa yang boleh dan tidak boleh dilakukan tiap peran. Hak akses ditegakkan server." },
  pseudonim: { title: "Pseudonim peserta", body: "Kode pengganti identitas peserta pada layar petugas dan dasbor AI. Nama hanya tampil bila memang dibutuhkan pada ruang kasus." },
} as const satisfies Record<string, GlossaryEntry>;

export type GlossaryKey = keyof typeof GLOSSARY;
