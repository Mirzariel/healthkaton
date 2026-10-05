import type { SVGProps } from "react";

/** Ikon garis sederhana untuk konsol (24x24, stroke mengikuti currentColor). Semua dekoratif (aria-hidden). */
function Svg({ children, ...p }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden width={20} height={20} {...p}>
      {children}
    </svg>
  );
}
type P = SVGProps<SVGSVGElement>;

export const IconInbox = (p: P) => (
  <Svg {...p}>
    <path d="M3 13l2.6-7.2A2 2 0 0 1 7.5 4.5h9a2 2 0 0 1 1.9 1.3L21 13" />
    <path d="M3 13v5a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5h-5.5a2 2 0 0 1-2 1.8h-3A2 2 0 0 1 8.5 13H3z" />
  </Svg>
);
export const IconShieldCheck = (p: P) => (
  <Svg {...p}>
    <path d="M12 3l7 3v5.5c0 4.3-2.9 7.7-7 9.5-4.1-1.8-7-5.2-7-9.5V6l7-3z" />
    <path d="M9 12l2.2 2.2L15.5 10" />
  </Svg>
);
export const IconScroll = (p: P) => (
  <Svg {...p}>
    <path d="M8 4h10a2 2 0 0 1 2 2v11a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-1h12v1a1 1 0 0 0 2 0V6" />
    <path d="M8 4a2 2 0 0 0-2 2v10M10 8h6M10 12h6" />
  </Svg>
);
export const IconUpload = (p: P) => (
  <Svg {...p}>
    <path d="M12 16V4M7 9l5-5 5 5" />
    <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
  </Svg>
);
export const IconChart = (p: P) => (
  <Svg {...p}>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </Svg>
);
export const IconUsers = (p: P) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
    <path d="M16 5.2a3 3 0 0 1 0 5.6M18 14.8c1.8.6 3 2.2 3 4.7" />
  </Svg>
);
export const IconArrow = (p: P) => (
  <Svg {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
);
export const IconAlert = (p: P) => (
  <Svg {...p}>
    <path d="M12 4l9 16H3L12 4z" />
    <path d="M12 10v4M12 17.2v.1" />
  </Svg>
);
export const IconClock = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Svg>
);
export const IconCoins = (p: P) => (
  <Svg {...p}>
    <ellipse cx="9" cy="7" rx="5.5" ry="2.8" />
    <path d="M3.5 7v5c0 1.5 2.5 2.8 5.5 2.8s5.5-1.3 5.5-2.8V7" />
    <path d="M14.5 10.5c3 0 6-.9 6-2.5V7M20.5 8v5c0 1.5-2.5 2.8-5.5 2.8" />
  </Svg>
);
export const IconCheckCircle = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M8.5 12.3l2.4 2.4 4.6-5" />
  </Svg>
);
export const IconGhost = (p: P) => (
  <Svg {...p}>
    <path d="M5 20V11a7 7 0 0 1 14 0v9l-2.3-1.8L14.3 20 12 18.2 9.7 20l-2.4-1.8L5 20z" />
    <path d="M9.5 11h.01M14.5 11h.01" strokeWidth={2.4} />
  </Svg>
);
export const IconCopy = (p: P) => (
  <Svg {...p}>
    <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
    <path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5" />
  </Svg>
);
export const IconSplit = (p: P) => (
  <Svg {...p}>
    <path d="M12 3v6M12 9L6 15v6M12 9l6 6v6" />
  </Svg>
);
export const IconMenu = (p: P) => (
  <Svg {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Svg>
);
export const IconX = (p: P) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);
export const IconReset = (p: P) => (
  <Svg {...p}>
    <path d="M4 12a8 8 0 1 0 2.6-5.9L4 8.5" />
    <path d="M4 4v4.5h4.5" />
  </Svg>
);
export const IconSend = (p: P) => (
  <Svg {...p}>
    <path d="M21 3L10 14M21 3l-7 18-4-7-7-4 18-7z" />
  </Svg>
);
export const IconFlask = (p: P) => (
  <Svg {...p}>
    <path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2.2h12.4a1.5 1.5 0 0 0 1.3-2.2L14 9V3" />
    <path d="M7.5 15h9" />
  </Svg>
);
export const IconSearch = (p: P) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4.5 4.5" />
  </Svg>
);
export const IconPhone = (p: P) => (
  <Svg {...p}>
    <rect x="7" y="3" width="10" height="18" rx="2.2" />
    <path d="M11 18h2" />
  </Svg>
);
export const IconMessage = (p: P) => (
  <Svg {...p}>
    <path d="M20 12a8 8 0 0 1-11.7 7.1L4 20l1-4A8 8 0 1 1 20 12z" />
  </Svg>
);
export const IconGavel = (p: P) => (
  <Svg {...p}>
    <path d="M13 6l5 5M9.5 9.5l5 5M11 4.5l4 4-5 5-4-4 5-5zM4 20l6-6" />
    <path d="M13 20h8" />
  </Svg>
);
export const IconUser = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" />
  </Svg>
);
export const IconFlag = (p: P) => (
  <Svg {...p}>
    <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
  </Svg>
);
