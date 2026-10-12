import SehatiLogo from "@/components/SehatiLogo";

/** Logo SEHATI (konsep B). `dark` memakai varian terbalik untuk permukaan gelap. */
export function Brand({ size = 34, dark = false, tagline = false }: { size?: number; dark?: boolean; tagline?: boolean }) {
  return <SehatiLogo size={size} showWordmark showTagline={tagline} inverse={dark} />;
}
