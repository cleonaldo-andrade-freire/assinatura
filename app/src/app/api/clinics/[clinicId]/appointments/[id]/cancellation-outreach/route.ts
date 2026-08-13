import { NextRequest, NextResponse } from "next/server";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { sendCancellationOutreach } from "@/lib/appointmentNotifications";
import type { Appointment } from "@/lib/database.types";

/**
 * Dispara o contato de reengajamento pelo painel "Cancelamentos" do
 * dashboard. Não marca nada na consulta — mandar mensagem é só uma
 * tentativa; quem tira da lista é o reagendamento de verdade (automático)
 * ou o "excluir da lista" manual.
 */
export async function POST(_req: NextRequest, { params }: { params: { clinicId: string; id: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: appointment } = await supabase
    .from("appointments")
    .select("*")
    .eq("id", params.id)
    .eq("clinic_id", clinic.id)
    .maybeSingle();
  if (!appointment) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  try {
    await sendCancellationOutreach(supabase, clinic, appointment as Appointment);
  } catch (err) {
    console.error("Falha ao enviar contato pós-cancelamento por WhatsApp:", err);
    return NextResponse.json({ error: "send_failed" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
