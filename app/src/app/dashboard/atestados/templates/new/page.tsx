import { redirect } from "next/navigation";
import { getClinicAndRole } from "@/lib/auth";
import { ClinicShell } from "@/components/clinic/ClinicShell";
import { CertificateTemplateForm } from "@/components/CertificateTemplateForm";

export default async function NewCertificateTemplatePage() {
  const auth = await getClinicAndRole();
  if (!auth) redirect("/login");
  if (auth.role !== "owner") redirect("/dashboard");
  const { clinic, role, userEmail } = auth;

  return (
    <ClinicShell
      clinicName={clinic.name}
      clinicLogoUrl={clinic.logo_url}
      title="Novo modelo de atestado"
      role={role}
      userEmail={userEmail}
    >
      <CertificateTemplateForm clinicId={clinic.id} />
    </ClinicShell>
  );
}
