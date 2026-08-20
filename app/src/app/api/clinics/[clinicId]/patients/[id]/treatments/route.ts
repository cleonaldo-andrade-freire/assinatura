import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createDebitForTreatment } from "@/lib/treatmentDebits";
import type { Treatment } from "@/lib/database.types";

const bodySchema = z.object({
  treatment_name: z.string().min(1),
  tooth_region: z.string().nullable().optional(),
  price: z.number().nonnegative(),
  price_table_name: z.string().nullable().optional(),
});

/** Tratamentos em aberto do paciente — usado pelo resumo no detalhe do
 * agendamento (ver OpenTreatmentsSummary), pra dentista saber do que se
 * trata sem precisar abrir a ficha do paciente antes. */
export async function GET(_req: NextRequest, { params }: { params: { clinicId: string; id: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("treatments")
    .select("id, treatment_name, tooth_region, price, created_at")
    .eq("clinic_id", clinic.id)
    .eq("patient_id", params.id)
    .eq("status", "aberto")
    .order("created_at", { ascending: true });

  return NextResponse.json({ treatments: data ?? [] });
}

/** Cria um tratamento direto na ficha do paciente, sem passar por um orçamento. */
export async function POST(req: NextRequest, { params }: { params: { clinicId: string; id: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: patient } = await supabase.from("patients").select("id").eq("id", params.id).eq("clinic_id", clinic.id).maybeSingle();
  if (!patient) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", message: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const { data: treatment, error } = await supabase
    .from("treatments")
    .insert({
      clinic_id: clinic.id,
      patient_id: patient.id,
      budget_id: null,
      budget_item_id: null,
      treatment_name: parsed.data.treatment_name,
      tooth_region: parsed.data.tooth_region || null,
      price: parsed.data.price,
      price_table_name: parsed.data.price_table_name || null,
      // Clínica de dentista único — nunca se escolhe quem é o responsável.
      dentist_name: clinic.dentist_name || clinic.name,
      status: "aberto",
      display_order: 0,
    })
    .select("*")
    .single();

  if (error || !treatment) {
    return NextResponse.json({ error: "insert_failed", message: error?.message }, { status: 500 });
  }

  try {
    await createDebitForTreatment(supabase, treatment as Treatment);
  } catch (err) {
    // O tratamento já foi criado (o que importa mais) — só o débito falhou.
    console.error("Falha ao criar débito do tratamento:", err);
  }

  return NextResponse.json({ treatment }, { status: 201 });
}
