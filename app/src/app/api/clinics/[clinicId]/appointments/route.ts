import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isValidBRPhone } from "@/lib/validation";
import { findOverlappingAppointment, recordAppointmentEvent, APPOINTMENT_SLOT_MINUTES } from "@/lib/appointments";
import { sendAppointmentRequest } from "@/lib/appointmentNotifications";
import { upsertPatientFromContact } from "@/lib/patients";

const bodySchema = z.object({
  scheduled_at: z.string().refine((v) => !Number.isNaN(Date.parse(v)), { message: "data/hora inválida" }),
  duration_minutes: z.number().int().positive().optional(),
  professional_name: z.string().min(1),
  patient_id: z.string().uuid().nullable().optional(),
  patient_name: z.string().min(1),
  patient_phone: z.string().refine(isValidBRPhone, { message: "celular inválido" }),
  urgent: z.boolean().optional(),
  notes: z.string().optional(),
  return_due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "data de retorno inválida" }).optional(),
});

/**
 * Lista agendamentos dentro de um período (`from`/`to`, ISO) — nunca a tabela
 * inteira. É o que sustenta a visão diária/semanal/mensal sem degradar com
 * volume (pedido explícito do escopo: performance da visão semanal/mensal).
 */
export async function GET(req: NextRequest, { params }: { params: { clinicId: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  if (!from || !to || Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to))) {
    return NextResponse.json({ error: "invalid_range" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("appointments")
    .select("*")
    .eq("clinic_id", clinic.id)
    .gte("scheduled_at", from)
    .lt("scheduled_at", to)
    .order("scheduled_at", { ascending: true });

  if (error) return NextResponse.json({ error: "query_failed", message: error.message }, { status: 500 });
  return NextResponse.json({ appointments: data ?? [] });
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
  const durationMinutes = input.duration_minutes ?? APPOINTMENT_SLOT_MINUTES;

  if (new Date(input.scheduled_at).getTime() < Date.now()) {
    return NextResponse.json(
      { error: "past_datetime", message: "Não dá pra agendar num horário que já passou." },
      { status: 400 }
    );
  }

  const supabase = await createSupabaseServerClient();

  const conflict = await findOverlappingAppointment(supabase, {
    clinicId: clinic.id,
    professionalName: input.professional_name,
    scheduledAt: input.scheduled_at,
    durationMinutes,
  });
  if (conflict) {
    return NextResponse.json(
      { error: "schedule_conflict", message: "Já existe um agendamento nesse horário para este profissional." },
      { status: 409 }
    );
  }

  // Se quem agendou não veio da busca de paciente (sem patient_id — só
  // digitou nome e celular), cadastra o paciente automaticamente aqui, mesmo
  // padrão já usado em atestados/prescrições/anamneses — sem isso, marcar
  // consulta pra alguém novo nunca criava um cadastro, só o agendamento.
  const patientId = input.patient_id ?? (await upsertPatientFromContact(supabase, clinic.id, input.patient_name, input.patient_phone));

  const { data: appointment, error } = await supabase
    .from("appointments")
    .insert({
      clinic_id: clinic.id,
      scheduled_at: input.scheduled_at,
      duration_minutes: durationMinutes,
      professional_name: input.professional_name,
      patient_id: patientId,
      patient_name: input.patient_name,
      patient_phone: input.patient_phone,
      urgent: input.urgent ?? false,
      notes: input.notes ?? null,
      return_due_date: input.return_due_date ?? null,
    })
    .select("*")
    .single();

  if (error || !appointment) {
    // 23P01 = exclusion_violation — a checagem prévia acima cobre o caminho
    // feliz, mas se duas criações concorrentes passarem por ela ao mesmo
    // tempo, é a constraint do banco (migration 022) que barra de verdade.
    if (error?.code === "23P01") {
      return NextResponse.json(
        { error: "schedule_conflict", message: "Já existe um agendamento nesse horário para este profissional." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "insert_failed", message: error?.message }, { status: 500 });
  }

  await recordAppointmentEvent(supabase, {
    appointmentId: appointment.id,
    clinicId: clinic.id,
    eventType: "created",
    toStatus: "agendado",
    actor: "recepcao",
  });

  // Best-effort — mesmo padrão do resto do app (ex.: notifyClinicSigned):
  // uma falha de WhatsApp não pode impedir o agendamento de ser criado.
  try {
    await sendAppointmentRequest(supabase, clinic, appointment);
  } catch (err) {
    console.error("Falha ao enviar confirmação de agendamento por WhatsApp:", err);
  }

  // "À medida que for reagendando, sair da lista" — se este paciente tinha
  // OUTRAS consultas pendentes nas listas de acompanhamento do dashboard
  // (retorno ou cancelamento), este novo agendamento já cumpre o papel
  // delas. `.neq("id", appointment.id)` é essencial: sem isso, um
  // agendamento que já nasce com `return_due_date` (campo "Retornar em"
  // deste mesmo POST) se autodispensa da lista no mesmo instante em que
  // entra nela. Best-effort: não pode travar a criação do agendamento.
  if (patientId) {
    try {
      const now = new Date().toISOString();
      await supabase
        .from("appointments")
        .update({ return_dismissed_at: now })
        .eq("clinic_id", clinic.id)
        .eq("patient_id", patientId)
        .neq("id", appointment.id)
        .not("return_due_date", "is", null)
        .is("return_dismissed_at", null);

      await supabase
        .from("appointments")
        .update({ cancellation_dismissed_at: now })
        .eq("clinic_id", clinic.id)
        .eq("patient_id", patientId)
        .neq("id", appointment.id)
        .in("status", ["cancelado_paciente", "cancelado_dentista"])
        .is("cancellation_dismissed_at", null);
    } catch (err) {
      console.error("Falha ao tirar o paciente das listas de acompanhamento após reagendar:", err);
    }
  }

  return NextResponse.json({ appointment }, { status: 201 });
}
