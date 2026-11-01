import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  patient_id: z.string().uuid(),
  treatment_id: z.string().uuid().nullable().optional(),
  description: z.string().trim().min(1, "Informe a descrição.").max(200),
  amount: z.number().positive("Informe um valor maior que zero."),
});

/**
 * Lançamento manual de débito na ficha do paciente — ligado a um tratamento
 * do próprio paciente (ex.: cobrança complementar) ou avulso (sem
 * `treatment_id`, ex.: material, taxa). Não passa por `treatmentDebits.ts`
 * de propósito: lá o débito espelha o preço do tratamento, aqui o valor é o
 * que a pessoa digitou.
 */
export async function POST(req: NextRequest, { params }: { params: { clinicId: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", message: parsed.error.issues[0]?.message }, { status: 400 });
  }
  const { patient_id, treatment_id, description, amount } = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data: patient } = await supabase
    .from("patients")
    .select("id")
    .eq("id", patient_id)
    .eq("clinic_id", clinic.id)
    .maybeSingle();
  if (!patient) return NextResponse.json({ error: "patient_not_found" }, { status: 404 });

  if (treatment_id) {
    const { data: treatment } = await supabase
      .from("treatments")
      .select("id")
      .eq("id", treatment_id)
      .eq("clinic_id", clinic.id)
      .eq("patient_id", patient_id)
      .maybeSingle();
    if (!treatment) return NextResponse.json({ error: "treatment_not_found", message: "Tratamento não encontrado." }, { status: 404 });
  }

  const { data: debit, error } = await supabase
    .from("treatment_debits")
    .insert({
      clinic_id: clinic.id,
      patient_id,
      treatment_id: treatment_id ?? null,
      description,
      amount: Math.round(amount * 100) / 100,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: "insert_failed", message: error.message }, { status: 500 });
  return NextResponse.json({ debit });
}
