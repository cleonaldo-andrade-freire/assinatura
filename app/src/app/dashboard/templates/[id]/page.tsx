import { redirect } from "next/navigation";
import { getClinicAndRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ClinicShell } from "@/components/clinic/ClinicShell";
import { TemplateEditor } from "@/components/TemplateEditor";
import type { QuestionTemplate } from "@/lib/database.types";

export default async function EditTemplatePage({ params }: { params: { id: string } }) {
  const auth = await getClinicAndRole();
  if (!auth) redirect("/login");
  if (auth.role !== "owner") redirect("/dashboard");
  const { clinic, role, userEmail } = auth;

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("question_templates")
    .select("*")
    .eq("id", params.id)
    .eq("clinic_id", clinic.id)
    .single();

  if (!data) redirect("/dashboard/templates");
  const template = data as QuestionTemplate;

  return (
    <ClinicShell
      clinicName={clinic.name}
      clinicLogoUrl={clinic.logo_url}
      title="Editar modelo"
      role={role}
      userEmail={userEmail}
    >
      <TemplateEditor
        clinicId={clinic.id}
        templateId={template.id}
        initialName={template.name}
        initialQuestions={template.questions}
      />
    </ClinicShell>
  );
}
