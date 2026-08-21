import { redirect } from "next/navigation";
import { getClinicAndRole } from "@/lib/auth";
import { ClinicShell } from "@/components/clinic/ClinicShell";
import { PrescriptionTemplateForm } from "@/components/PrescriptionTemplateForm";

export default async function NewPrescriptionTemplatePage() {
  const auth = await getClinicAndRole();
  if (!auth) redirect("/login");
  if (auth.role !== "owner") redirect("/dashboard");
  const { clinic, role, userEmail, userName, userAvatarUrl } = auth;

  return (
    <ClinicShell
      clinicName={clinic.name}
      clinicLogoUrl={clinic.logo_url}
      title="Novo modelo de receituário"
      role={role}
      userEmail={userEmail}
      userName={userName}
      userAvatarUrl={userAvatarUrl}
    >
      <PrescriptionTemplateForm clinicId={clinic.id} />
    </ClinicShell>
  );
}
