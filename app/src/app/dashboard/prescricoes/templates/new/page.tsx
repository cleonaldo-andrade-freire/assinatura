import { redirect } from "next/navigation";
import { getCurrentClinic } from "@/lib/auth";
import { ClinicShell } from "@/components/clinic/ClinicShell";
import { PrescriptionTemplateForm } from "@/components/PrescriptionTemplateForm";

export default async function NewPrescriptionTemplatePage() {
  const clinic = await getCurrentClinic();
  if (!clinic) redirect("/login");

  return (
    <ClinicShell clinicName={clinic.name} clinicLogoUrl={clinic.logo_url} title="Novo modelo de prescrição">
      <PrescriptionTemplateForm clinicId={clinic.id} />
    </ClinicShell>
  );
}
