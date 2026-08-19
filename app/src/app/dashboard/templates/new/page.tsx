import { redirect } from "next/navigation";
import { getClinicAndRole } from "@/lib/auth";
import { ClinicShell } from "@/components/clinic/ClinicShell";
import { TemplateEditor } from "@/components/TemplateEditor";

export default async function NewTemplatePage() {
  const auth = await getClinicAndRole();
  if (!auth) redirect("/login");
  if (auth.role !== "owner") redirect("/dashboard");
  const { clinic, role, userEmail } = auth;

  return (
    <ClinicShell
      clinicName={clinic.name}
      clinicLogoUrl={clinic.logo_url}
      title="Novo modelo de anamnese"
      subtitle='Ex.: "Adulto", "Criança", "Simples" — o paciente responde uma pergunta de cada vez pelo WhatsApp'
      role={role}
      userEmail={userEmail}
    >
      <TemplateEditor clinicId={clinic.id} />
    </ClinicShell>
  );
}
