import React from "react";

export type SehatiLogoProps = {
  size?: number;
  showWordmark?: boolean;
  showTagline?: boolean;
  className?: string;
  title?: string;
};

export function SehatiLogo({
  size = 40,
  showWordmark = true,
  showTagline = false,
  className,
  title = "SEHATI",
}: SehatiLogoProps) {
  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        color: "#0B0D0C",
        fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
      }}
      aria-label={title}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 256 256"
        role="img"
        aria-hidden="true"
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: "block", flex: "0 0 auto" }}
      >
        <path d="M174 38H103C67 38 46 58 46 88c0 25 16 40 43 47l35 10c12 3 18 8 18 16 0 9-8 14-21 14H65v39h65c40 0 64-21 64-53 0-26-16-42-44-50l-37-10c-11-3-17-7-17-14 0-8 7-12 20-12h58z" fill="#2FA58F" />
        <path d="M82 218h72c37 0 59-20 59-50 0-25-16-41-43-49l-38-11c-12-3-18-8-18-16 0-9 8-14 21-14h67V39h-66c-40 0-64 21-64 53 0 26 16 42 44 50l37 10c11 3 16 7 16 14 0 8-7 12-19 12H82z" fill="#0B5C4F" />
      </svg>
      {showWordmark && (
        <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: Math.max(16, size * 0.43), fontWeight: 750, letterSpacing: "0.14em", lineHeight: 1 }}>
            SEHATI
          </span>
          {showTagline && (
            <span style={{ color: "#0B0D0C", fontSize: 11, lineHeight: 1.3 }}>
              Suara Pasien, Layanan Lebih Baik
            </span>
          )}
        </span>
      )}
    </span>
  );
}

export default SehatiLogo;
