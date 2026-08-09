import { redirect } from "next/navigation";
import { getCurrentClinic } from "@/lib/auth";
import { ClinicShell } from "@/components/clinic/ClinicShell";
import { TemplateEditor } from "@/components/TemplateEditor";

export default async function NewTemplatePage() {
  const clinic = await getCurrentClinic();
  if (!clinic) redirect("/login");

  return (
    <ClinicShell
      clinicName={clinic.name}
      clinicLogoUrl={clinic.logo_url}
      title="Novo modelo de anamnese"
      subtitle='Ex.: "Adulto", "Criança", "Simples" — o paciente responde uma pergunta de cada vez pelo WhatsApp'
    >
      <TemplateEditor clinicId={clinic.id} />
    </ClinicShell>
  );
}
