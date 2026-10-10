import SehatiLogo from "@/components/SehatiLogo";

/** Logo SEHATI (konsep B). `dark` memakai wordmark putih di permukaan gelap. */
export function Brand({ size = 34, dark = false, tagline = false }: { size?: number; dark?: boolean; tagline?: boolean }) {
  return (
    <span className={dark ? "[&_span]:!text-white [&_span]:!font-semibold" : ""}>
      <SehatiLogo size={size} showWordmark showTagline={tagline} />
    </span>
  );
}
