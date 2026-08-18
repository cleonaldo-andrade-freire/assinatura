import { redirect } from "next/navigation";
import { getClinicAndRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ClinicShell } from "@/components/clinic/ClinicShell";
import { TeamPanel } from "@/components/clinic/TeamPanel";
import type { Profile } from "@/lib/database.types";

export default async function EquipePage() {
  const auth = await getClinicAndRole();
  if (!auth) redirect("/login");
  // Somente owner pode gerenciar a equipe
  if (auth.role !== "owner") redirect("/dashboard");

  const supabase = await createSupabaseServerClient();

  // Busca o usuário logado para marcar "Você" na lista
  const { data: { user } } = await supabase.auth.getUser();

  const { data: members } = await supabase
    .from("profiles")
    .select("id, email, role, created_at")
    .eq("clinic_id", auth.clinic.id)
    .order("created_at", { ascending: true });

  return (
    <ClinicShell
      clinicName={auth.clinic.name}
      clinicLogoUrl={auth.clinic.logo_url}
      title="Equipe"
      subtitle="Gerencie os membros que têm acesso ao sistema"
      role={auth.role}
    >
      <TeamPanel
        clinicId={auth.clinic.id}
        currentUserId={user?.id ?? ""}
        initialMembers={(members as Profile[]) ?? []}
      />
    </ClinicShell>
  );
}
