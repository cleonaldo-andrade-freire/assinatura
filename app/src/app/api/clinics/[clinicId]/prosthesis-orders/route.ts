import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isValidBRPhone } from "@/lib/validation";
import { recordProsthesisOrderEvent, notifyProsthesisStageChange } from "@/lib/prosthesisOrders";

const bodySchema = z.object({
  patient_id: z.string().uuid().nullable().optional(),
  patient_name: z.string().min(1),
  patient_phone: z.string().refine(isValidBRPhone, { message: "celular inválido" }),
  description: z.string().min(1),
  expected_delivery_date: z.string().nullable().optional(),
});

/** Lista todos os serviços de prótese em aberto/concluídos da clínica — o board carrega tudo de uma vez e organiza por coluna no cliente (volume baixo, não precisa paginar). */
export async function GET(_req: NextRequest, { params }: { params: { clinicId: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("prosthesis_orders")
    .select("*")
    .eq("clinic_id", clinic.id)
    .order("stage_since", { ascending: true });

  if (error) return NextResponse.json({ error: "query_failed", message: error.message }, { status: 500 });
  return NextResponse.json({ orders: data ?? [] });
}

export async function POST(req: NextRequest, { params }: { params: { clinicId: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data: order, error } = await supabase
    .from("prosthesis_orders")
    .insert({
      clinic_id: clinic.id,
      patient_id: input.patient_id ?? null,
      patient_name: input.patient_name,
      patient_phone: input.patient_phone,
      description: input.description,
      expected_delivery_date: input.expected_delivery_date || null,
      stage: "pre_laboratorio",
    })
    .select("*")
    .single();

  if (error || !order) {
    return NextResponse.json({ error: "insert_failed", message: error?.message }, { status: 500 });
  }

  await recordProsthesisOrderEvent(supabase, {
    prosthesisOrderId: order.id,
    clinicId: clinic.id,
    fromStage: null,
    toStage: "pre_laboratorio",
    actor: "recepcao",
  });

  // Best-effort — mesmo padrão do resto do app: uma falha de WhatsApp não
  // pode impedir o serviço de ter sido criado.
  try {
    await notifyProsthesisStageChange(supabase, clinic, order);
  } catch (err) {
    console.error("Falha ao avisar o paciente sobre a entrada da prótese por WhatsApp:", err);
  }

  return NextResponse.json({ order }, { status: 201 });
}
