import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { issueReceiptPdf } from "@/lib/receiptNotifications";
import type { TreatmentDebit } from "@/lib/database.types";

const bodySchema = z.object({
  debit_ids: z.array(z.string().uuid()).min(1),
  declared_ir: z.boolean(),
});

/** Emite um recibo cobrindo um ou mais débitos já pagos — gera o PDF na hora e marca os débitos como receitados. */
export async function POST(req: NextRequest, { params }: { params: { clinicId: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", message: parsed.error.issues[0]?.message }, { status: 400 });
  }
  const { debit_ids, declared_ir } = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data: debitsData, error: fetchError } = await supabase
    .from("treatment_debits")
    .select("*")
    .eq("clinic_id", clinic.id)
    .in("id", debit_ids);
  if (fetchError) return NextResponse.json({ error: "query_failed", message: fetchError.message }, { status: 500 });

  const debits = (debitsData as TreatmentDebit[]) ?? [];
  if (debits.length !== debit_ids.length) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (debits.some((d) => d.status !== "pago")) {
    return NextResponse.json({ error: "not_paid", message: "Só é possível emitir recibo de débitos já pagos." }, { status: 409 });
  }
  if (debits.some((d) => d.receipt_id)) {
    return NextResponse.json({ error: "already_receipted", message: "Um ou mais débitos selecionados já estão num recibo." }, { status: 409 });
  }
  const patientId = debits[0].patient_id;
  if (debits.some((d) => d.patient_id !== patientId)) {
    return NextResponse.json({ error: "mixed_patients", message: "Os débitos selecionados não são do mesmo paciente." }, { status: 400 });
  }

  const { data: patient } = await supabase.from("patients").select("name, phone").eq("id", patientId).eq("clinic_id", clinic.id).maybeSingle();
  if (!patient) return NextResponse.json({ error: "patient_not_found" }, { status: 404 });

  const totalAmount = debits.reduce((sum, d) => sum + d.amount, 0);

  const { data: receipt, error: insertError } = await supabase
    .from("receipts")
    .insert({
      clinic_id: clinic.id,
      patient_id: patientId,
      patient_name: patient.name,
      patient_phone: patient.phone,
      total_amount: totalAmount,
      declared_ir,
    })
    .select("*")
    .single();
  if (insertError || !receipt) {
    return NextResponse.json({ error: "insert_failed", message: insertError?.message }, { status: 500 });
  }

  const { error: tagError } = await supabase.from("treatment_debits").update({ receipt_id: receipt.id }).in("id", debit_ids);
  if (tagError) console.error("Falha ao vincular débitos ao recibo:", tagError);

  let updatedReceipt = receipt;
  try {
    updatedReceipt = await issueReceiptPdf(supabase, clinic, receipt, debits);
  } catch (err) {
    // O recibo já existe (o que importa mais) — só o PDF falhou; o envio por
    // WhatsApp tenta gerar de novo se ainda estiver faltando (ver sendReceiptWhatsApp).
    console.error("Falha ao gerar PDF do recibo:", err);
  }

  return NextResponse.json({ receipt: updatedReceipt }, { status: 201 });
}
