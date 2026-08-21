import { redirect } from "next/navigation";
import { getClinicAndRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ClinicShell } from "@/components/clinic/ClinicShell";
import { LeadsBoard } from "@/components/LeadsBoard";
import type { Lead } from "@/lib/database.types";

export default async function LeadsPage() {
  const auth = await getClinicAndRole();
  if (!auth) redirect("/login");
  const { clinic, role, userEmail, userName, userAvatarUrl } = auth;

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("leads")
    .select("*")
    .eq("clinic_id", clinic.id)
    .order("created_at", { ascending: false });
  const leads = (data as Lead[]) ?? [];

  return (
    <ClinicShell
      clinicName={clinic.name}
      clinicLogoUrl={clinic.logo_url}
      title="Leads"
      subtitle="Triagem automática por IA no WhatsApp — números fora do fluxo de anamnese/agenda"
      role={role}
      userEmail={userEmail}
      userName={userName}
      userAvatarUrl={userAvatarUrl}
    >
      <LeadsBoard clinicId={clinic.id} role={role} leads={leads} />
    </ClinicShell>
  );
}
