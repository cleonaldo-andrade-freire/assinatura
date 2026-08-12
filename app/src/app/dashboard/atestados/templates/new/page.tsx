import { redirect } from "next/navigation";
import { getCurrentClinic } from "@/lib/auth";
import { ClinicShell } from "@/components/clinic/ClinicShell";
import { CertificateTemplateForm } from "@/components/CertificateTemplateForm";

export default async function NewCertificateTemplatePage() {
  const clinic = await getCurrentClinic();
  if (!clinic) redirect("/login");

  return (
    <ClinicShell clinicName={clinic.name} clinicLogoUrl={clinic.logo_url} title="Novo modelo de atestado">
      <CertificateTemplateForm clinicId={clinic.id} />
    </ClinicShell>
  );
}
