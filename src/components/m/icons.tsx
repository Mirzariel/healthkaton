import type { ReactNode } from "react";

function Svg({ children, size = 24, className }: { children: ReactNode; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  );
}

type P = { size?: number; className?: string };

export const IconCheck = (p: P) => (
  <Svg {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
);
export const IconX = (p: P) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);
export const IconQuestion = (p: P) => (
  <Svg {...p}>
    <path d="M9.2 9a3 3 0 115.2 2c-.9 1-2.4 1.4-2.4 3" />
    <path d="M12 18h.01" />
  </Svg>
);
export const IconClipboard = (p: P) => (
  <Svg {...p}>
    <rect x="6" y="4.5" width="12" height="16" rx="2.5" />
    <path d="M9.5 4.5V4a1 1 0 011-1h3a1 1 0 011 1v.5" />
    <path d="M9.5 13l2 2 3.5-4" />
  </Svg>
);
export const IconClock = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Svg>
);
export const IconHospital = (p: P) => (
  <Svg {...p}>
    <path d="M4 20.5V8.5l8-4.5 8 4.5v12M2.5 20.5h19" />
    <path d="M12 10v5M9.5 12.5h5" />
  </Svg>
);
export const IconInfo = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </Svg>
);
export const IconLock = (p: P) => (
  <Svg {...p}>
    <rect x="5" y="11" width="14" height="9" rx="2.5" />
    <path d="M8 11V8a4 4 0 018 0v3" />
  </Svg>
);
export const IconChevron = (p: P) => (
  <Svg {...p}>
    <path d="M6 9l6 6 6-6" />
  </Svg>
);
export const IconRetry = (p: P) => (
  <Svg {...p}>
    <path d="M20 12a8 8 0 11-2.6-5.9" />
    <path d="M20 4v5h-5" />
  </Svg>
);
export const IconSpeaker = (p: P) => (
  <Svg {...p}>
    <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z" />
    <path d="M15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11" />
  </Svg>
);
export const IconStop = (p: P) => (
  <Svg {...p}>
    <rect x="6.5" y="6.5" width="11" height="11" rx="2" />
  </Svg>
);
export const IconArrowLeft = (p: P) => (
  <Svg {...p}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </Svg>
);
export const IconArrowRight = (p: P) => (
  <Svg {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
);
export const IconShield = (p: P) => (
  <Svg {...p}>
    <path d="M12 3l7.500 2.800v5.700c0 4.700-3.100 8.300-7.500 9.800-4.400-1.500-7.500-5.100-7.500-9.800V5.800L12 3z" />
    <path d="M8.800 12.200l2.300 2.300 4.200-4.600" />
  </Svg>
);
export const IconHeart = (p: P) => (
  <Svg {...p}>
    <path d="M12 20s-7.500-4.600-7.500-10.200A4.300 4.300 0 0112 7.500a4.300 4.300 0 017.500 2.300C19.500 15.400 12 20 12 20z" />
  </Svg>
);
export const IconList = (p: P) => (
  <Svg {...p}>
    <path d="M9 7h10M9 12h10M9 17h10" />
    <path d="M5 7h.01M5 12h.01M5 17h.01" />
  </Svg>
);

export const IconHome = (p: P) => (
  <Svg {...p}>
    <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" />
  </Svg>
);
export const IconFlag = (p: P) => (
  <Svg {...p}>
    <path d="M5.5 20.5v-16M5.5 4.5h11l-2 4 2 4h-11" />
  </Svg>
);
export const IconHistory = (p: P) => (
  <Svg {...p}>
    <path d="M4.5 12a7.500 7.500 0 1 0 2.200-5.300L4.500 9" />
    <path d="M4.500 4.500V9H9M12 8v4l2.500 2.500" />
  </Svg>
);
export const IconHelp = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.500" />
    <circle cx="12" cy="12" r="3.200" />
    <path d="m6 6 3.800 3.800M18 6l-3.800 3.800M6 18l3.800-3.800M18 18l-3.800-3.800" />
  </Svg>
);
export const IconEdit = (p: P) => (
  <Svg {...p}>
    <path d="M5 19h3.500L19 8.500a2.100 2.100 0 0 0-3-3L5.500 16z" />
    <path d="m14.500 7 2.500 2.500" />
  </Svg>
);
export const IconAlert = (p: P) => (
  <Svg {...p}>
    <path d="M10.300 4.800 3.600 16.500A2 2 0 0 0 5.300 19.500h13.400a2 2 0 0 0 1.700-3L13.700 4.800a2 2 0 0 0-3.400 0z" />
    <path d="M12 10v3.500M12 16.500h.01" />
  </Svg>
);
export const IconSend = (p: P) => (
  <Svg {...p}>
    <path d="M5 12 19 5l-4.500 14-3-5.500z" />
    <path d="m11.500 13.500 3-3" />
  </Svg>
);
