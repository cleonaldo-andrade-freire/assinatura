import { NextRequest, NextResponse } from "next/server";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { sendReceiptWhatsApp } from "@/lib/receiptNotifications";
import type { TreatmentDebit } from "@/lib/database.types";

/** Dispara o recibo por WhatsApp com um link de download do PDF. */
export async function POST(_req: NextRequest, { params }: { params: { clinicId: string; id: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: receipt } = await supabase.from("receipts").select("*").eq("id", params.id).eq("clinic_id", clinic.id).maybeSingle();
  if (!receipt) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (!receipt.patient_phone) {
    return NextResponse.json({ error: "no_phone", message: "Paciente sem WhatsApp cadastrado." }, { status: 400 });
  }

  const { data: debitsData } = await supabase.from("treatment_debits").select("*").eq("receipt_id", receipt.id);

  try {
    await sendReceiptWhatsApp(supabase, clinic, receipt, (debitsData as TreatmentDebit[]) ?? []);
  } catch (err) {
    console.error("Falha ao enviar recibo por WhatsApp:", err);
    return NextResponse.json({ error: "send_failed" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
