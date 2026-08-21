import { redirect } from "next/navigation";
import { getClinicAndRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ClinicShell } from "@/components/clinic/ClinicShell";
import { EvolucoesPendentesClient } from "@/components/EvolucoesPendentesClient";
import { formatTreatmentsLabel } from "@/lib/treatments";

/** Junta, entre todos os pacientes, as evoluções que a dentista ainda não
 * assinou digitalmente (ICP-Brasil, agente local) — sem esta tela só dava
 * pra assinar entrando no tratamento de cada paciente, um por um. */
export default async function EvolucoesPendentesPage() {
  const auth = await getClinicAndRole();
  if (!auth) redirect("/login");
  if (auth.role !== "owner") redirect("/dashboard");
  const { clinic, role, userEmail, userName, userAvatarUrl } = auth;

  const supabase = await createSupabaseServerClient();
  // Só entram aqui evoluções que o paciente já assinou — a contra-assinatura
  // da dentista só é possível depois disso, pra poder mesclar as duas
  // assinaturas num único PDF (ver evolutionDentistSignature.ts).
  const { data: evolutions } = await supabase
    .from("treatment_evolutions")
    .select("id, treatment_id, patient_id, evolution_date, text, created_at, signature_status, dentist_signature_status")
    .eq("clinic_id", clinic.id)
    .eq("dentist_signature_status", "nao_assinada")
    .eq("signature_status", "assinada")
    .order("evolution_date", { ascending: false })
    .limit(200);

  const list = evolutions ?? [];
  const patientIds = [...new Set(list.map((e) => e.patient_id))];
  const evolutionIds = list.map((e) => e.id);

  // Uma evolução pode cobrir mais de um tratamento (finalizados juntos) —
  // busca todos os vinculados pela tabela de junção, não só a âncora legada
  // de treatment_evolutions.treatment_id, senão esta lista mostraria só um
  // dos tratamentos do grupo.
  const [{ data: patients }, { data: links }] = await Promise.all([
    patientIds.length ? supabase.from("patients").select("id, name").in("id", patientIds) : Promise.resolve({ data: [] }),
    evolutionIds.length
      ? supabase
          .from("treatment_evolution_treatments")
          .select("treatment_evolution_id, treatments(treatment_name, tooth_region)")
          .in("treatment_evolution_id", evolutionIds)
      : Promise.resolve({ data: [] }),
  ]);
  const patientById = new Map((patients ?? []).map((p) => [p.id, p]));
  const treatmentsByEvolutionId = new Map<string, { treatment_name: string; tooth_region: string | null }[]>();
  for (const link of (links ?? []) as unknown as { treatment_evolution_id: string; treatments: { treatment_name: string; tooth_region: string | null } | { treatment_name: string; tooth_region: string | null }[] | null }[]) {
    const linkedTreatment = Array.isArray(link.treatments) ? link.treatments[0] : link.treatments;
    if (!linkedTreatment) continue;
    const existing = treatmentsByEvolutionId.get(link.treatment_evolution_id) ?? [];
    existing.push(linkedTreatment);
    treatmentsByEvolutionId.set(link.treatment_evolution_id, existing);
  }

  const rows = list.map((e) => {
    const treatments = treatmentsByEvolutionId.get(e.id) ?? [];
    return {
      id: e.id as string,
      evolution_date: e.evolution_date as string,
      text: e.text as string,
      patient_id: e.patient_id as string,
      patient_name: patientById.get(e.patient_id)?.name ?? "—",
      treatment_name:
        treatments.length > 0
          ? formatTreatmentsLabel(treatments.map((t) => ({ name: t.treatment_name, toothRegion: t.tooth_region })))
          : "—",
      // O rótulo acima já embute a região de cada tratamento — não precisa
      // de um tooth_region separado (EvolucoesPendentesClient só antepõe
      // isto quando presente).
      tooth_region: null as string | null,
    };
  });

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
