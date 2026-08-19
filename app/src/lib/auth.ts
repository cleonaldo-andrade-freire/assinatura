import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Clinic } from "@/lib/database.types";

export async function getCurrentClinic(): Promise<Clinic | null> {
  const result = await getClinicAndRole();
  return result?.clinic ?? null;
}

/**
 * Retorna a clínica e o papel (role) do usuário logado em um único round-trip
 * ao banco. Use esta função em vez de `getCurrentClinic()` sempre que precisar
 * diferenciar owner de staff.
 */
export async function getClinicAndRole(): Promise<{
  clinic: Clinic;
  role: "owner" | "staff";
  userEmail: string;
  userName: string | null;
  userAvatarUrl: string | null;
} | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // RLS garante que isso só retorna o perfil do próprio usuário logado.
  const { data: profile } = await supabase
    .from("profiles")
    .select("clinic_id, role, name, avatar_url")
    .eq("id", user.id)
    .single();
  if (!profile) return null;

  const { data: clinic } = await supabase
    .from("clinics")
    .select("*")
    .eq("id", profile.clinic_id)
    .single();
  if (!clinic) return null;

  return {
    clinic: clinic as Clinic,
    role: (profile.role as "owner" | "staff") ?? "owner",
    userEmail: user.email ?? "",
    userName: profile.name ?? null,
    userAvatarUrl: profile.avatar_url ?? null,
  };
}
