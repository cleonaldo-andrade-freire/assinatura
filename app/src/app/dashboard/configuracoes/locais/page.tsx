import { redirect } from "next/navigation";
import Link from "next/link";
import { getClinicAndRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ClinicShell } from "@/components/clinic/ClinicShell";
import { LocationsManager } from "@/components/LocationsManager";
import type { ClinicLocation } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

export default async function LocationsPage() {
  const auth = await getClinicAndRole();
  if (!auth) redirect("/login");
  if (auth.role !== "owner") redirect("/dashboard");
  const { clinic, role, userEmail, userName, userAvatarUrl } = auth;

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("clinic_locations")
    .select("*")
    .eq("clinic_id", clinic.id)
    .order("is_default", { ascending: false })
    .order("name", { ascending: true });

  return (
    <ClinicShell
      clinicName={clinic.name}
      clinicLogoUrl={clinic.logo_url}
      title="Locais de atendimento"
      subtitle="Endereços onde a clínica atende — vão nas mensagens da agenda e no envio da anamnese"
      role={role}
      userEmail={userEmail}
      userName={userName}
      userAvatarUrl={userAvatarUrl}
      actions={
        <Link href="/dashboard/configuracoes" className={`${styles.btn} ${styles.btnGhost}`}>
          ← Configurações
        </Link>
      }
    >
      <LocationsManager clinicId={clinic.id} initialLocations={(data as ClinicLocation[]) ?? []} />
    </ClinicShell>
  );
}
