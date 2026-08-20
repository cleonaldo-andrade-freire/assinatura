import { redirect } from "next/navigation";
import { getClinicAndRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ClinicShell } from "@/components/clinic/ClinicShell";
import { EvolucoesPendentesClient } from "@/components/EvolucoesPendentesClient";

/** Junta, entre todos os pacientes, as evoluções que a dentista ainda não
 * assinou digitalmente (ICP-Brasil, agente local) — sem esta tela só dava
 * pra assinar entrando no tratamento de cada paciente, um por um. */
export default async function EvolucoesPendentesPage() {
  const auth = await getClinicAndRole();
  if (!auth) redirect("/login");
  if (auth.role !== "owner") redirect("/dashboard");
  const { clinic, role, userEmail, userName, userAvatarUrl } = auth;

  const supabase = await createSupabaseServerClient();
  const { data: evolutions } = await supabase
    .from("treatment_evolutions")
    .select("id, treatment_id, patient_id, evolution_date, text, created_at, signature_status, dentist_signature_status")
    .eq("clinic_id", clinic.id)
    .eq("dentist_signature_status", "nao_assinada")
    .order("evolution_date", { ascending: false })
    .limit(200);

  const list = evolutions ?? [];
  const patientIds = [...new Set(list.map((e) => e.patient_id))];
  const treatmentIds = [...new Set(list.map((e) => e.treatment_id))];

  const [{ data: patients }, { data: treatments }] = await Promise.all([
    patientIds.length ? supabase.from("patients").select("id, name").in("id", patientIds) : Promise.resolve({ data: [] }),
    treatmentIds.length ? supabase.from("treatments").select("id, treatment_name, tooth_region").in("id", treatmentIds) : Promise.resolve({ data: [] }),
  ]);
  const patientById = new Map((patients ?? []).map((p) => [p.id, p]));
  const treatmentById = new Map((treatments ?? []).map((t) => [t.id, t]));

  const rows = list.map((e) => ({
    id: e.id as string,
    evolution_date: e.evolution_date as string,
    text: e.text as string,
    patient_id: e.patient_id as string,
    patient_name: patientById.get(e.patient_id)?.name ?? "—",
    treatment_name: treatmentById.get(e.treatment_id)?.treatment_name ?? "—",
    tooth_region: (treatmentById.get(e.treatment_id)?.tooth_region as string | null) ?? null,
  }));

  return (
    <ClinicShell
      clinicName={clinic.name}
      clinicLogoUrl={clinic.logo_url}
      title="Evoluções pendentes de assinatura"
      subtitle="Assine digitalmente (ICP-Brasil) e envie ao paciente para ciência — individualmente ou em lote"
      role={role}
      userEmail={userEmail}
      userName={userName}
      userAvatarUrl={userAvatarUrl}
    >
      <EvolucoesPendentesClient clinicId={clinic.id} dentistCpf={clinic.dentist_cpf} initialRows={rows} />
    </ClinicShell>
  );
}
