import type { SupabaseClient } from "@supabase/supabase-js";
import type { Appointment, AppointmentEventActor, AppointmentStatus } from "@/lib/database.types";

export const APPOINTMENT_SLOT_MINUTES = 30;

// Horário de funcionamento assumido pra desenhar a grade — o schema não tem
// um campo de horário de expediente por clínica ainda. 08h–19h cobre o
// horário comercial típico; um agendamento fora dessa faixa (se algum dia
// existir) continua funcionando, só não aparece como uma linha vazia extra.
export const AGENDA_START_HOUR = 8;
export const AGENDA_END_HOUR = 19;

/** Horários (ISO, em UTC) de cada slot de 30min do dia `dateStr` ("YYYY-MM-DD", calendário do Brasil). */
export function buildDaySlotTimes(dateStr: string, startHour = AGENDA_START_HOUR, endHour = AGENDA_END_HOUR): string[] {
  const slots: string[] = [];
  for (let h = startHour; h < endHour; h++) {
    for (const m of [0, 30]) {
      const hh = String(h).padStart(2, "0");
      const mm = String(m).padStart(2, "0");
      slots.push(new Date(`${dateStr}T${hh}:${mm}:00-03:00`).toISOString());
    }
  }
  return slots;
}

export const APPOINTMENT_STATUS_LABEL: Record<AppointmentStatus, string> = {
  agendado: "Agendado",
  confirmado: "Confirmado",
  cancelado_paciente: "Cancelado (paciente)",
  cancelado_dentista: "Cancelado (clínica)",
  atendido: "Atendido",
};

/** Nomes de classe de `shell.module.css` — ver plano de design da agenda: cancelamento (por quem for) compartilha uma cor, "atendido" reaproveita o azul-assinatura em vez de inventar um 5º tom. */
export const APPOINTMENT_STATUS_CLASS: Record<AppointmentStatus, string> = {
  agendado: "statusWarn",
  confirmado: "statusOk",
  cancelado_paciente: "statusDanger",
  cancelado_dentista: "statusDanger",
  atendido: "statusInfo",
};

/** Status que liberam o horário pra realocação — não entram na exclusão de sobreposição no banco (ver migration 022). */
export const FREED_STATUSES: AppointmentStatus[] = ["cancelado_paciente", "cancelado_dentista"];

export function isCancelled(status: AppointmentStatus): boolean {
  return FREED_STATUSES.includes(status);
}

export function appointmentEndsAt(scheduledAt: string, durationMinutes: number): Date {
  return new Date(new Date(scheduledAt).getTime() + durationMinutes * 60_000);
}

/** Duas faixas [aStart,aEnd) e [bStart,bEnd) se sobrepõem sse aStart < bEnd e bStart < aEnd. */
export function rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

interface OverlapCheckInput {
  clinicId: string;
  professionalName: string;
  scheduledAt: string;
  durationMinutes: number;
  /** Ignora o próprio registro ao remarcar (senão ele colidiria consigo mesmo). */
  excludeAppointmentId?: string;
}

/**
 * Checagem prévia, a nível de aplicação, só pra devolver um erro amigável
 * (com qual agendamento conflita) antes de bater no banco. A garantia de
 * verdade contra concorrência é o `EXCLUDE USING gist` da migration 022 —
 * esta função não substitui isso, só melhora a mensagem de erro no caminho
 * feliz (criação manual pela recepção, não é um caminho concorrente).
 */
export async function findOverlappingAppointment(
  supabase: SupabaseClient,
  { clinicId, professionalName, scheduledAt, durationMinutes, excludeAppointmentId }: OverlapCheckInput
): Promise<Appointment | null> {
  const start = new Date(scheduledAt);
  const end = appointmentEndsAt(scheduledAt, durationMinutes);

  let query = supabase
    .from("appointments")
    .select("*")
    .eq("clinic_id", clinicId)
    .eq("professional_name", professionalName)
    .not("status", "in", `(${FREED_STATUSES.join(",")})`)
    // Duas faixas [a,b) e [c,d) se sobrepõem sse a < d e c < b.
    .lt("scheduled_at", end.toISOString());
  if (excludeAppointmentId) query = query.neq("id", excludeAppointmentId);

  const { data } = await query;
  const candidates = (data as Appointment[]) ?? [];
  return (
    candidates.find((a) => rangesOverlap(start, end, new Date(a.scheduled_at), appointmentEndsAt(a.scheduled_at, a.duration_minutes))) ??
    null
  );
}

export async function recordAppointmentEvent(
  supabase: SupabaseClient,
  input: {
    appointmentId: string;
    clinicId: string;
    eventType: "created" | "status_changed" | "rescheduled";
    fromStatus?: AppointmentStatus | null;
    toStatus?: AppointmentStatus | null;
    actor: AppointmentEventActor;
    meta?: Record<string, unknown>;
  }
): Promise<void> {
  await supabase.from("appointment_events").insert({
    appointment_id: input.appointmentId,
    clinic_id: input.clinicId,
    event_type: input.eventType,
    from_status: input.fromStatus ?? null,
    to_status: input.toStatus ?? null,
    actor: input.actor,
    meta: input.meta ?? null,
  });
}
