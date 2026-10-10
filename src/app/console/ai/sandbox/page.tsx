import { SandboxLab } from "@/components/ai/SandboxLab";
import { Forbidden, PageHeader, SimNotice } from "@/components/ui";
import { can } from "@/lib/auth/principal";
import { getPrincipal } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function SandboxPage() {
  const me = await getPrincipal("konsol");
  if (!can(me, "ai.sandbox")) return <Forbidden need="ai.sandbox" />;
  return (
    <>
      <PageHeader eyebrow="Standar dan AI" title="Sandbox AI" purpose="Coba satu jawaban terhadap dua konfigurasi, termasuk kegagalan yang disuntikkan, untuk melihat bagaimana validator dan fallback bekerja. Tidak ada data nyata yang berubah." />
      <div className="mb-4"><SimNotice>Mode “Simulasi” memakai penafsir aturan, bukan model. Hasilnya menunjukkan perilaku validator dan fallback, bukan kualitas pemahaman bahasa oleh model AI.</SimNotice></div>
      <SandboxLab />
    </>
  );
}
