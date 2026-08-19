import { notFound, redirect } from "next/navigation";
import { getClinicAndRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ClinicShell } from "@/components/clinic/ClinicShell";
import { PrescriptionTemplateForm } from "@/components/PrescriptionTemplateForm";
import type { PrescriptionTemplate } from "@/lib/database.types";

export default async function EditPrescriptionTemplatePage({ params }: { params: { id: string } }) {
  const auth = await getClinicAndRole();
  if (!auth) redirect("/login");
  if (auth.role !== "owner") redirect("/dashboard");
  const { clinic, role, userEmail } = auth;

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("prescription_templates")
    .select("*")
    .eq("id", params.id)
    .eq("clinic_id", clinic.id)
    .maybeSingle();
  if (!data) notFound();

  return (
    <ClinicShell
      clinicName={clinic.name}
      clinicLogoUrl={clinic.logo_url}
      title={(data as PrescriptionTemplate).name}
      role={role}
      userEmail={userEmail}
    >
      <PrescriptionTemplateForm clinicId={clinic.id} template={data as PrescriptionTemplate} />
    </ClinicShell>
  );
}
