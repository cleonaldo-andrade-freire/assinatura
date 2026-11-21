import { notFound, redirect } from "next/navigation";
import { getClinicAndRole } from "@/lib/auth";
import { ClinicShell } from "@/components/clinic/ClinicShell";
import { CampaignForm } from "@/components/campaigns/CampaignForm";

export default async function NovaCampanhaPage() {
  const auth = await getClinicAndRole();
  if (!auth) redirect("/login");
  if (auth.role !== "owner") redirect("/dashboard");
  const { clinic, role, userEmail, userName, userAvatarUrl } = auth;
  if (!clinic.campaigns_enabled) notFound();

  return (
    <ClinicShell
      clinicName={clinic.name}
      clinicLogoUrl={clinic.logo_url}
      campaignsEnabled={clinic.campaigns_enabled}
      title="Nova campanha"
      subtitle="Salva como rascunho — nada é enviado até você iniciar"
      role={role}
      userEmail={userEmail}
      userName={userName}
      userAvatarUrl={userAvatarUrl}
    >
      <CampaignForm clinicId={clinic.id} clinicName={clinic.name} />
    </ClinicShell>
  );
}
