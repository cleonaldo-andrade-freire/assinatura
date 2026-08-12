import { redirect } from "next/navigation";
import { getCurrentClinic } from "@/lib/auth";
import { ClinicShell } from "@/components/clinic/ClinicShell";
import { PatientForm } from "@/components/PatientForm";

export default async function NewPatientPage() {
  const clinic = await getCurrentClinic();
  if (!clinic) redirect("/login");

  return (
    <ClinicShell clinicName={clinic.name} clinicLogoUrl={clinic.logo_url} title="Novo paciente">
      <PatientForm clinicId={clinic.id} />
    </ClinicShell>
  );
}
