import { notFound, redirect } from "next/navigation";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ClinicShell } from "@/components/clinic/ClinicShell";
import { PrescriptionTemplateForm } from "@/components/PrescriptionTemplateForm";
import type { PrescriptionTemplate } from "@/lib/database.types";

export default async function EditPrescriptionTemplatePage({ params }: { params: { id: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic) redirect("/login");

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("prescription_templates")
    .select("*")
    .eq("id", params.id)
    .eq("clinic_id", clinic.id)
    .maybeSingle();
  if (!data) notFound();

  return (
    <ClinicShell clinicName={clinic.name} clinicLogoUrl={clinic.logo_url} title={(data as PrescriptionTemplate).name}>
      <PrescriptionTemplateForm clinicId={clinic.id} template={data as PrescriptionTemplate} />
    </ClinicShell>
  );
}
