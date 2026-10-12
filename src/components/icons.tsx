import type { ReactNode } from "react";

/* Ikon garis SEHATI: 24×24, garis 1.75, ujung membulat. Ukuran bawaan 16px agar tidak mendominasi teks.
   Hanya untuk memperjelas makna (navigasi, status, aksi), bukan hiasan. */

type P = { size?: number; className?: string; strokeWidth?: number };

function Svg({ children, size = 16, className, strokeWidth = 1.75 }: P & { children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className={className}>
      {children}
    </svg>
  );
}

export const IconHome = (p: P) => <Svg {...p}><path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" /></Svg>;
export const IconInbox = (p: P) => <Svg {...p}><path d="M4 13.5 6.2 6.1A1.5 1.5 0 0 1 7.6 5h8.8a1.5 1.5 0 0 1 1.4 1.1L20 13.5V18a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18z" /><path d="M4 13.5h4.5l1 2h5l1-2H20" /></Svg>;
export const IconSparkle = (p: P) => <Svg {...p}><path d="M12 4.5 13.6 9a2 2 0 0 0 1.4 1.4l4.5 1.6-4.5 1.6a2 2 0 0 0-1.4 1.4L12 19.5 10.4 15A2 2 0 0 0 9 13.6L4.5 12 9 10.4A2 2 0 0 0 10.4 9z" /></Svg>;
export const IconChecklist = (p: P) => <Svg {...p}><path d="M10 6.5h9.5M10 12h9.5M10 17.5h9.5" /><path d="m4.5 6.5 1.2 1.2 2-2.2M4.5 12l1.2 1.2 2-2.2M4.5 17.5l1.2 1.2 2-2.2" /></Svg>;
export const IconFile = (p: P) => <Svg {...p}><path d="M14 3.5H7.5A1.5 1.5 0 0 0 6 5v14a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 18 19V7.5z" /><path d="M14 3.5v4h4M9 12.5h6M9 16h4" /></Svg>;
export const IconLayers = (p: P) => <Svg {...p}><path d="m12 4 8 4.2-8 4.3-8-4.3z" /><path d="m4 12.2 8 4.3 8-4.3M4 16l8 4.3 8-4.3" /></Svg>;
export const IconUpload = (p: P) => <Svg {...p}><path d="M12 15.5V4.5M7.5 9 12 4.5 16.5 9" /><path d="M4.5 15v3.5A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5V15" /></Svg>;
export const IconBook = (p: P) => <Svg {...p}><path d="M5 5.5A1.5 1.5 0 0 1 6.5 4H19v13.5H6.5A1.5 1.5 0 0 0 5 19z" /><path d="M5 19a1.5 1.5 0 0 0 1.5 1.5H19M9 8h6" /></Svg>;
export const IconCpu = (p: P) => <Svg {...p}><rect x="6.5" y="6.5" width="11" height="11" rx="2" /><path d="M10 10h4v4h-4zM9.5 3.5v3M14.5 3.5v3M9.5 17.5v3M14.5 17.5v3M3.5 9.5h3M3.5 14.5h3M17.5 9.5h3M17.5 14.5h3" /></Svg>;
export const IconGauge = (p: P) => <Svg {...p}><path d="M4.5 16.5a7.5 7.5 0 1 1 15 0" /><path d="m12 16.5 3.5-4.5" /><path d="M4.5 19.5h15" /></Svg>;
export const IconChart = (p: P) => <Svg {...p}><path d="M4.5 4.5v15h15" /><path d="M8.5 15v-3.5M12.5 15V8.5M16.5 15v-6" /></Svg>;
export const IconCard = (p: P) => <Svg {...p}><rect x="4" y="5.5" width="16" height="13" rx="2" /><path d="M8 10h8M8 14h5" /></Svg>;
export const IconWallet = (p: P) => <Svg {...p}><path d="M4.5 7.5A2 2 0 0 1 6.5 5.5H17v3" /><rect x="4.5" y="8.5" width="15" height="10" rx="2" /><path d="M15.5 13.5h1" /></Svg>;
export const IconShield = (p: P) => <Svg {...p}><path d="M12 3.5 19 6v5.5c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9V6z" /><path d="m9 12 2 2 4-4" /></Svg>;
export const IconUsers = (p: P) => <Svg {...p}><circle cx="9" cy="9" r="3.2" /><path d="M3.8 19a5.2 5.2 0 0 1 10.4 0" /><path d="M15.5 6.2a3 3 0 0 1 0 5.6M17.3 14.4A5 5 0 0 1 20.2 19" /></Svg>;
export const IconHospital = (p: P) => <Svg {...p}><path d="M5 20V6.5A1.5 1.5 0 0 1 6.5 5h11A1.5 1.5 0 0 1 19 6.5V20" /><path d="M3.5 20h17M12 8.5v5M9.5 11h5M10 20v-3h4v3" /></Svg>;
export const IconPhone = (p: P) => <Svg {...p}><rect x="7" y="3.5" width="10" height="17" rx="2.2" /><path d="M11 17.5h2" /></Svg>;
export const IconMessage = (p: P) => <Svg {...p}><path d="M5 6.5A1.5 1.5 0 0 1 6.5 5h11A1.5 1.5 0 0 1 19 6.5v8a1.5 1.5 0 0 1-1.5 1.5H10l-4 3.5V16h0a1 1 0 0 1-1-1z" /></Svg>;
export const IconScale = (p: P) => <Svg {...p}><path d="M12 4.5v15M7.5 19.5h9M5 7.5h14" /><path d="m5 7.5-2.5 6a2.8 2.8 0 0 0 5 0zM19 7.5l-2.5 6a2.8 2.8 0 0 0 5 0z" /></Svg>;
export const IconWrench = (p: P) => <Svg {...p}><path d="M14.5 5.2a4 4 0 0 0-5 5.3l-5 5a1.8 1.8 0 0 0 2.5 2.5l5-5a4 4 0 0 0 5.3-5l-2.3 2.3-2.3-.4-.4-2.3z" /></Svg>;
export const IconSearch = (p: P) => <Svg {...p}><circle cx="11" cy="11" r="6" /><path d="m15.5 15.5 4 4" /></Svg>;
export const IconFilter = (p: P) => <Svg {...p}><path d="M4.5 6h15M7.5 12h9M10.5 18h3" /></Svg>;
export const IconInfo = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 8v.01" /></Svg>;
export const IconAlert = (p: P) => <Svg {...p}><path d="M10.3 4.8 3.6 16.5A2 2 0 0 0 5.3 19.5h13.4a2 2 0 0 0 1.7-3L13.7 4.8a2 2 0 0 0-3.4 0z" /><path d="M12 10v3.5M12 16.5v.01" /></Svg>;
export const IconCheck = (p: P) => <Svg {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></Svg>;
export const IconCheckCircle = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="m8.5 12.2 2.4 2.3 4.6-4.8" /></Svg>;
export const IconX = (p: P) => <Svg {...p}><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" /></Svg>;
export const IconLock = (p: P) => <Svg {...p}><rect x="5.5" y="10.5" width="13" height="9" rx="2" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /></Svg>;
export const IconClock = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></Svg>;
export const IconArrowRight = (p: P) => <Svg {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Svg>;
export const IconArrowLeft = (p: P) => <Svg {...p}><path d="M19 12H5M11 6l-6 6 6 6" /></Svg>;
export const IconArrowUpRight = (p: P) => <Svg {...p}><path d="M7 17 17 7M9 7h8v8" /></Svg>;
export const IconChevronRight = (p: P) => <Svg {...p}><path d="m9.5 6 6 6-6 6" /></Svg>;
export const IconChevronDown = (p: P) => <Svg {...p}><path d="m6 9.5 6 6 6-6" /></Svg>;
export const IconMenu = (p: P) => <Svg {...p}><path d="M4.5 7h15M4.5 12h15M4.5 17h15" /></Svg>;
export const IconRefresh = (p: P) => <Svg {...p}><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" /><path d="M19.5 4.5v4h-4" /></Svg>;
export const IconLink = (p: P) => <Svg {...p}><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></Svg>;
export const IconDownload = (p: P) => <Svg {...p}><path d="M12 4.5v11M7.5 11l4.5 4.5 4.5-4.5" /><path d="M4.5 15v3.5A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5V15" /></Svg>;
export const IconPrinter = (p: P) => <Svg {...p}><path d="M7 9V4.5h10V9" /><rect x="4.5" y="9" width="15" height="7" rx="1.5" /><path d="M7.5 14h9v5.5h-9z" /></Svg>;
export const IconUser = (p: P) => <Svg {...p}><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></Svg>;
export const IconFlag = (p: P) => <Svg {...p}><path d="M5.5 20.5v-16M5.5 4.5h11l-2 4 2 4h-11" /></Svg>;
export const IconHistory = (p: P) => <Svg {...p}><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9" /><path d="M4.5 4.5V9H9M12 8v4l2.5 2" /></Svg>;
export const IconBeaker = (p: P) => <Svg {...p}><path d="M9.5 4h5M10 4v5.5L5.2 17.6A1.6 1.6 0 0 0 6.6 20h10.8a1.6 1.6 0 0 0 1.4-2.4L14 9.5V4" /><path d="M7.5 14.5h9" /></Svg>;
export const IconDot = ({ className = "" }: { className?: string }) => <span aria-hidden className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-current ${className}`} />;
