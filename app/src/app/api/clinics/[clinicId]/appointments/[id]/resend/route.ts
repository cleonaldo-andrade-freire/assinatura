import { NextRequest, NextResponse } from "next/server";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendAppointmentRequest } from "@/lib/appointmentNotifications";
import type { Appointment } from "@/lib/database.types";

/**
 * Reenvia a mensagem de confirmação por WhatsApp (mesmo texto/link de
 * quando o agendamento foi criado) — pra quando o envio automático falhou,
 * ou a recepção só quer dar um empurrão manual antes do lembrete
 * automático de 24h entrar em ação.
 */
export async function POST(_req: NextRequest, { params }: { params: { clinicId: string; id: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: appointment } = await supabase
    .from("appointments")
    .select("*")
    .eq("id", params.id)
    .eq("clinic_id", clinic.id)
    .maybeSingle();
  if (!appointment) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (appointment.status !== "agendado") {
    return NextResponse.json({ error: "not_pending" }, { status: 409 });
  }

  try {
    await sendAppointmentRequest(clinic, appointment as Appointment);
  } catch (err) {
    console.error("Falha ao reenviar confirmação de agendamento por WhatsApp:", err);
    return NextResponse.json({ error: "send_failed" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
