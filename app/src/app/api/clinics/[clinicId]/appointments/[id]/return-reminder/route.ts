import { NextRequest, NextResponse } from "next/server";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { sendAppointmentReturnReminder } from "@/lib/appointmentNotifications";
import type { Appointment } from "@/lib/database.types";

/**
 * Dispara o lembrete de retorno pelo painel "Retornos próximos" e marca
 * `return_notified_at` — some da lista de pendentes depois de avisado (a
 * recepção decide se quer mandar de novo direto pela tela de detalhe do
 * agendamento, não tem um "reenviar" separado aqui).
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
    await sendAppointmentReturnReminder(supabase, clinic, appointment as Appointment);
  } catch (err) {
    console.error("Falha ao enviar lembrete de retorno por WhatsApp:", err);
    return NextResponse.json({ error: "send_failed" }, { status: 502 });
  }

  const { error } = await supabase
    .from("appointments")
    .update({ return_notified_at: new Date().toISOString() })
    .eq("id", appointment.id);
  if (error) {
    return NextResponse.json({ error: "update_failed", message: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
