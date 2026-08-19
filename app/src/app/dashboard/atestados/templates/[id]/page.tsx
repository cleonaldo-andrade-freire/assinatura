import { notFound, redirect } from "next/navigation";
import { getClinicAndRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ClinicShell } from "@/components/clinic/ClinicShell";
import { CertificateTemplateForm } from "@/components/CertificateTemplateForm";
import type { CertificateTemplate } from "@/lib/database.types";

export default async function EditCertificateTemplatePage({ params }: { params: { id: string } }) {
  const auth = await getClinicAndRole();
  if (!auth) redirect("/login");
  if (auth.role !== "owner") redirect("/dashboard");
  const { clinic, role, userEmail, userName, userAvatarUrl } = auth;

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("certificate_templates")
    .select("*")
    .eq("id", params.id)
    .eq("clinic_id", clinic.id)
    .maybeSingle();
  if (!data) notFound();

  return (
    <ClinicShell
      clinicName={clinic.name}
      clinicLogoUrl={clinic.logo_url}
      title={(data as CertificateTemplate).name}
      role={role}
      userEmail={userEmail}
      userName={userName}
      userAvatarUrl={userAvatarUrl}
    >
      <CertificateTemplateForm clinicId={clinic.id} template={data as CertificateTemplate} />
    </ClinicShell>
  );
}
