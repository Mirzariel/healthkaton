// Katalog SIMULASI. Bukan kode atau tarif resmi (INA-CBG/ICD).
export type Family =
  | "RESP"
  | "GI"
  | "CARDIO"
  | "ENDO"
  | "URO"
  | "OBS"
  | "ORTHO"
  | "INFEC"
  | "NEURO";

export const FAMILY_LABEL: Record<Family, string> = {
  RESP: "Pernapasan",
  GI: "Pencernaan",
  CARDIO: "Jantung & pembuluh darah",
  ENDO: "Endokrin",
  URO: "Saluran kemih",
  OBS: "Kebidanan",
  ORTHO: "Ortopedi",
  INFEC: "Infeksi",
  NEURO: "Saraf",
};

export interface DxInfo {
  code: string;
  text: string;
  family: Family;
  kind: "RJTL" | "RITL";
  baseAmount: number;
  los: [number, number]; // lama rawat (hari), RITL
  procs: string[]; // kode layanan lazim
}

export const DX: DxInfo[] = [
  { code: "J18.9", text: "Pneumonia", family: "RESP", kind: "RITL", baseAmount: 5200000, los: [3, 6], procs: ["RONTGEN", "NEBU", "LAB-DL"] },
  { code: "J45", text: "Asma", family: "RESP", kind: "RJTL", baseAmount: 650000, los: [0, 0], procs: ["NEBU"] },
  { code: "A09", text: "Gastroenteritis", family: "GI", kind: "RITL", baseAmount: 2800000, los: [2, 4], procs: ["LAB-DL", "INFUS"] },
  { code: "K35", text: "Apendisitis akut", family: "GI", kind: "RITL", baseAmount: 9400000, los: [3, 5], procs: ["USG", "OP-APP", "LAB-DL"] },
  { code: "I10", text: "Hipertensi esensial", family: "CARDIO", kind: "RJTL", baseAmount: 420000, los: [0, 0], procs: ["EKG"] },
  { code: "I21", text: "Infark miokard akut", family: "CARDIO", kind: "RITL", baseAmount: 18500000, los: [4, 7], procs: ["EKG", "ECHO", "LAB-DL"] },
  { code: "E11", text: "Diabetes melitus tipe 2", family: "ENDO", kind: "RJTL", baseAmount: 520000, los: [0, 0], procs: ["LAB-DL"] },
  { code: "N39.0", text: "Infeksi saluran kemih", family: "URO", kind: "RJTL", baseAmount: 560000, los: [0, 0], procs: ["LAB-DL", "USG"] },
  { code: "O80", text: "Persalinan spontan", family: "OBS", kind: "RITL", baseAmount: 4600000, los: [2, 3], procs: ["USG", "LAB-DL"] },
  { code: "S72", text: "Fraktur femur", family: "ORTHO", kind: "RITL", baseAmount: 21000000, los: [5, 9], procs: ["RONTGEN", "OP-FIX", "LAB-DL"] },
  { code: "A91", text: "Demam berdarah dengue", family: "INFEC", kind: "RITL", baseAmount: 3900000, los: [3, 5], procs: ["LAB-DL", "INFUS"] },
  { code: "I63", text: "Stroke iskemik", family: "NEURO", kind: "RITL", baseAmount: 14800000, los: [5, 9], procs: ["CT-SCAN", "EKG", "LAB-DL"] },
];

export interface SvcInfo {
  code: string;
  name: string;
  price: number;
  needsRecord: boolean; // butuh lembar tindakan sebagai bukti pelaksanaan
  families: Family[] | "*";
}
export const SVC: Record<string, SvcInfo> = {
  KMR: { code: "KMR", name: "Rawat inap / hari", price: 350000, needsRecord: false, families: "*" },
  KON: { code: "KON", name: "Konsultasi dokter spesialis", price: 150000, needsRecord: false, families: "*" },
  "LAB-DL": { code: "LAB-DL", name: "Laboratorium darah lengkap", price: 120000, needsRecord: true, families: "*" },
  INFUS: { code: "INFUS", name: "Terapi cairan infus", price: 180000, needsRecord: true, families: "*" },
  RONTGEN: { code: "RONTGEN", name: "Rontgen toraks", price: 250000, needsRecord: true, families: ["RESP", "ORTHO", "CARDIO"] },
  NEBU: { code: "NEBU", name: "Nebulisasi", price: 140000, needsRecord: true, families: ["RESP"] },
  USG: { code: "USG", name: "USG abdomen", price: 320000, needsRecord: true, families: ["GI", "URO", "OBS"] },
  EKG: { code: "EKG", name: "Elektrokardiografi", price: 200000, needsRecord: true, families: ["CARDIO", "NEURO"] },
  ECHO: { code: "ECHO", name: "Ekokardiografi", price: 750000, needsRecord: true, families: ["CARDIO"] },
  "CT-SCAN": { code: "CT-SCAN", name: "CT scan kepala", price: 1500000, needsRecord: true, families: ["NEURO"] },
  BRONKO: { code: "BRONKO", name: "Bronkoskopi", price: 3200000, needsRecord: true, families: ["RESP"] },
  ENDO: { code: "ENDO", name: "Endoskopi saluran cerna", price: 2400000, needsRecord: true, families: ["GI"] },
  "OP-APP": { code: "OP-APP", name: "Apendektomi", price: 5200000, needsRecord: true, families: ["GI"] },
  "OP-FIX": { code: "OP-FIX", name: "Fiksasi internal fraktur", price: 9800000, needsRecord: true, families: ["ORTHO"] },
  HEMODIA: { code: "HEMODIA", name: "Hemodialisis", price: 950000, needsRecord: true, families: ["URO"] },
};

// Layanan bernilai tinggi yang cocok dengan keluarga diagnosis (dipakai generator).
export const HIGH_COST_BY_FAMILY: Record<Family, string> = {
  RESP: "BRONKO",
  GI: "ENDO",
  CARDIO: "ECHO",
  ENDO: "INFUS",
  URO: "HEMODIA",
  OBS: "USG",
  ORTHO: "OP-FIX",
  INFEC: "INFUS",
  NEURO: "CT-SCAN",
};

export const HOSPITALS = [
  "RS Harapan Bunda (simulasi)",
  "RS Nusa Medika (simulasi)",
  "RSU Tirta Sehat (simulasi)",
];
export const DOCTORS = [
  "dr. Anindita, Sp.PD",
  "dr. Bagas, Sp.P",
  "dr. Citra, Sp.B",
  "dr. Dimas, Sp.JP",
  "dr. Eka, Sp.OG",
  "dr. Farid, Sp.S",
];

export function dxByCode(code: string) {
  return DX.find((d) => d.code === code);
}
export function familyOfGroup(groupCode: string): Family {
  return groupCode.split("-")[1] as Family;
}
export function groupFor(family: Family, severity: 1 | 2 | 3 = 2) {
  return `SIM-${family}-${severity}`;
}
