import { liveProvider } from "../ai/runtime";
import { registerLiveAdapter } from "./provider";

/* Memasang penyedia langsung produksi (Anthropic) ke harness evaluasi. Dipisah dari provider.ts agar seed/db tidak ikut memuat SDK.
   Penyedia ini hanya benar-benar dipakai bila ANTHROPIC_API_KEY ada (liveAvailable()); tanpa kunci, mode 'live' ditolak dengan alasan jelas. */
registerLiveAdapter(() => liveProvider());
