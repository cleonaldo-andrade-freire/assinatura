import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Clinic } from "@/lib/database.types";

export async function getCurrentClinic(): Promise<Clinic | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // RLS garante que isso só retorna o perfil/clínica do próprio usuário logado.
  const { data: profile } = await supabase.from("profiles").select("clinic_id").eq("id", user.id).single();
  if (!profile) return null;

  const { data: clinic } = await supabase.from("clinics").select("*").eq("id", profile.clinic_id).single();
  return (clinic as Clinic) ?? null;
}
