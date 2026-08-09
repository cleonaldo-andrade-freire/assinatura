import { redirect } from "next/navigation";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ClinicShell } from "@/components/clinic/ClinicShell";
import { NewAnamnesisForm } from "@/components/NewAnamnesisForm";
import type { QuestionTemplate } from "@/lib/database.types";

export default async function NewAnamnesisPage() {
  const clinic = await getCurrentClinic();
  if (!clinic) redirect("/login");

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("question_templates")
    .select("*")
    .eq("clinic_id", clinic.id)
    .order("created_at", { ascending: false });

  return (
    <ClinicShell
      clinicName={clinic.name}
      clinicLogoUrl={clinic.logo_url}
      title="Nova anamnese"
      subtitle="O paciente recebe a primeira pergunta no WhatsApp assim que você confirmar"
    >
      <NewAnamnesisForm clinicId={clinic.id} templates={(data as QuestionTemplate[]) ?? []} />
    </ClinicShell>
  );
}
