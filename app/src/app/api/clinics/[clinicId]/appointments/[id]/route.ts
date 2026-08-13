import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findOverlappingAppointment, recordAppointmentEvent } from "@/lib/appointments";
import type { Appointment, AppointmentStatus } from "@/lib/database.types";

const STATUS_VALUES: [AppointmentStatus, ...AppointmentStatus[]] = [
  "agendado",
  "confirmado",
  "cancelado_paciente",
  "cancelado_dentista",
  "atendido",
];

const patchSchema = z.object({
  status: z.enum(STATUS_VALUES).optional(),
  scheduled_at: z.string().refine((v) => !Number.isNaN(Date.parse(v)), { message: "data/hora inválida" }).optional(),
  duration_minutes: z.number().int().positive().optional(),
  urgent: z.boolean().optional(),
  notes: z.string().nullable().optional(),
  patient_id: z.string().uuid().nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { clinicId: string; id: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  const supabase = await createSupabaseServerClient();

  const { data: current } = await supabase
    .from("appointments")
    .select("*")
    .eq("id", params.id)
    .eq("clinic_id", clinic.id)
    .maybeSingle();
  if (!current) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const appointment = current as Appointment;

  const isReschedule = input.scheduled_at !== undefined || input.duration_minutes !== undefined;
  if (isReschedule) {
    const newScheduledAt = input.scheduled_at ?? appointment.scheduled_at;
    const newDuration = input.duration_minutes ?? appointment.duration_minutes;
    const conflict = await findOverlappingAppointment(supabase, {
      clinicId: clinic.id,
      professionalName: appointment.professional_name,
      scheduledAt: newScheduledAt,
      durationMinutes: newDuration,
      excludeAppointmentId: appointment.id,
    });
    if (conflict) {
      return NextResponse.json(
        { error: "schedule_conflict", message: "Já existe um agendamento nesse horário para este profissional." },
        { status: 409 }
      );
    }
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.status !== undefined) update.status = input.status;
  if (input.scheduled_at !== undefined) update.scheduled_at = input.scheduled_at;
  if (input.duration_minutes !== undefined) update.duration_minutes = input.duration_minutes;
  if (input.urgent !== undefined) update.urgent = input.urgent;
  if (input.notes !== undefined) update.notes = input.notes;
  if (input.patient_id !== undefined) update.patient_id = input.patient_id;

  const { data: updated, error } = await supabase
    .from("appointments")
    .update(update)
    .eq("id", appointment.id)
    .select("*")
    .single();

  if (error || !updated) {
    if (error?.code === "23P01") {
      return NextResponse.json(
        { error: "schedule_conflict", message: "Já existe um agendamento nesse horário para este profissional." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "update_failed", message: error?.message }, { status: 500 });
  }

  if (isReschedule) {
    await recordAppointmentEvent(supabase, {
      appointmentId: appointment.id,
      clinicId: clinic.id,
      eventType: "rescheduled",
      actor: "recepcao",
      meta: {
        from: { scheduled_at: appointment.scheduled_at, duration_minutes: appointment.duration_minutes },
        to: { scheduled_at: updated.scheduled_at, duration_minutes: updated.duration_minutes },
      },
    });
  }
  if (input.status !== undefined && input.status !== appointment.status) {
    await recordAppointmentEvent(supabase, {
      appointmentId: appointment.id,
      clinicId: clinic.id,
      eventType: "status_changed",
      fromStatus: appointment.status,
      toStatus: input.status,
      actor: "recepcao",
    });
  }

  return NextResponse.json({ appointment: updated });
}
