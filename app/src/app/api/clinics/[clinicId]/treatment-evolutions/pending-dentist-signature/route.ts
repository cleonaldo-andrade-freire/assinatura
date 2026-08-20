import { NextRequest, NextResponse } from "next/server";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Lista, entre todos os pacientes, as evoluções que a dentista ainda não
 * assinou digitalmente — base da tela de assinatura em lote (evoluções
 * vivem aninhadas dentro do tratamento de cada paciente; sem isso não
 * existe visão nenhuma que junte tudo pendente num só lugar). */
export async function GET(_req: NextRequest, { params }: { params: { clinicId: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

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

  const enriched = list.map((e) => ({
    ...e,
    patient_name: patientById.get(e.patient_id)?.name ?? "—",
    treatment_name: treatmentById.get(e.treatment_id)?.treatment_name ?? "—",
    tooth_region: treatmentById.get(e.treatment_id)?.tooth_region ?? null,
  }));

  return NextResponse.json({ evolutions: enriched });
}
