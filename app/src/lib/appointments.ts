import type { SupabaseClient } from "@supabase/supabase-js";
import { brDateOnly } from "@/lib/date";
import { brPhoneVariants } from "@/lib/validation";
import type { Appointment, AppointmentEventActor, AppointmentStatus } from "@/lib/database.types";

export const APPOINTMENT_SLOT_MINUTES = 30;

// Horário de funcionamento assumido pra desenhar a grade — o schema não tem
// um campo de horário de expediente por clínica ainda. 08h–19h cobre o
// horário comercial típico; um agendamento fora dessa faixa (se algum dia
// existir) continua funcionando, só não aparece como uma linha vazia extra.
export const AGENDA_START_HOUR = 8;
export const AGENDA_END_HOUR = 19;

/**
 * Chave canônica pra casar um `scheduled_at` vindo do banco com um horário de
 * `buildDaySlotTimes`. O Postgres/PostgREST devolve timestamptz como
 * "2026-08-13T11:00:00+00:00", enquanto `buildDaySlotTimes` (via
 * `Date.toISOString()`) gera "2026-08-13T11:00:00.000Z" — strings diferentes
 * pro mesmo instante. Comparar os dois direto como string (sem passar por
 * `new Date(...).toISOString()` dos dois lados) faz o agendamento existir no
 * banco mas nunca aparecer na grade/lista, porque a busca no Map nunca bate.
 */
export function slotKey(iso: string): string {
  return new Date(iso).toISOString();
}

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

export interface DaySummary {
  total: number;
  byStatus: Partial<Record<AppointmentStatus, number>>;
  anyUrgent: boolean;
}

/**
 * Agrega agendamentos por dia (calendário do Brasil) — é o que sustenta a
 * célula da visão mensal (não cabe o detalhe de cada agendamento numa
 * célula pequena, então vira contagem + distribuição de status + marcador
 * de urgência). Função pura, O(n) sobre a lista recebida — quem chama já
 * filtrou por período (nunca a tabela inteira), então n aqui é no máximo
 * "agendamentos de um mês", não o histórico completo da clínica.
 */
export function summarizeAppointmentsByDay(appointments: Appointment[]): Map<string, DaySummary> {
  const map = new Map<string, DaySummary>();
  for (const a of appointments) {
    const day = brDateOnly(new Date(a.scheduled_at));
    const entry = map.get(day) ?? { total: 0, byStatus: {}, anyUrgent: false };
    entry.total += 1;
    entry.byStatus[a.status] = (entry.byStatus[a.status] ?? 0) + 1;
    if (a.urgent) entry.anyUrgent = true;
    map.set(day, entry);
  }
  return map;
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

/**
 * Símbolo compacto por status — usado onde texto por extenso não cabe (chip
 * da grade semanal) sem deixar a informação só na cor. Junto com a legenda
 * da agenda, cobre o mesmo requisito de "nunca só cor" que a versão mobile
 * já cumpre com o rótulo por extenso.
 */
export const APPOINTMENT_STATUS_SYMBOL: Record<AppointmentStatus, string> = {
  agendado: "○",
  confirmado: "✓",
  cancelado_paciente: "✕",
  cancelado_dentista: "✕",
  atendido: "●",
};

/** Pra desenhar os pontinhos de resumo da célula do mês — mesmas 4 cores de `APPOINTMENT_STATUS_CLASS`, só que como valor de `background` em vez de `color`. */
export const APPOINTMENT_STATUS_DOT_COLOR: Record<AppointmentStatus, string> = {
  agendado: "var(--warn)",
  confirmado: "var(--brand)",
  cancelado_paciente: "var(--danger)",
  cancelado_dentista: "var(--danger)",
  atendido: "var(--sign)",
};

/**
 * Ainda "agendado" (sem resposta do paciente) e a consulta é daqui a menos
 * de `withinHours` — é o gatilho visual de "sem resposta" pra recepção
 * poder ligar manualmente como último recurso, pedido explícito do escopo
 * de lembrete escalonado. Não é um campo novo no banco: é derivado direto
 * de status + horário, então não precisa recalcular/expirar nada.
 */
export function needsManualFollowUp(a: Pick<Appointment, "status" | "scheduled_at">, withinHours = 4): boolean {
  if (a.status !== "agendado") return false;
  const hoursUntil = (new Date(a.scheduled_at).getTime() - Date.now()) / 3_600_000;
  return hoursUntil >= 0 && hoursUntil <= withinHours;
}

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

/**
 * Pra cada slot de 30min da grade que é "continuação" de um agendamento mais
 * longo (não o próprio horário de início dele), aponta qual agendamento —
 * sem isso, uma consulta de 60min marcada às 9h deixava o slot das 9h30
 * aparecendo como "vago" (o horário de início é o único que bate com
 * `slotKey`), quando na prática já está ocupado; o backend recusaria um
 * segundo agendamento ali, mas a tela mentia antes disso acontecer.
 * Agendamentos cancelados não contam — cancelar libera o horário de verdade.
 */
export function buildContinuationMap(appointments: Appointment[], slots: string[]): Map<string, Appointment> {
  const covered = new Map<string, Appointment>();
  for (const a of appointments) {
    if (isCancelled(a.status)) continue;
    const start = new Date(a.scheduled_at).getTime();
    const end = appointmentEndsAt(a.scheduled_at, a.duration_minutes).getTime();
    for (const s of slots) {
      const t = new Date(s).getTime();
      if (t > start && t < end) covered.set(s, a);
    }
  }
  return covered;
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

/**
 * O agendamento em aberto mais próximo pra um telefone — usado pelo webhook
 * pra decidir se uma resposta em texto livre ("confirmar"/"cancelar") deve
 * ser interpretada como resposta de agendamento. Só considera `agendado`
 * (já confirmado/cancelado/atendido não precisa mais de resposta) e só
 * consultas futuras (uma passada não faz sentido "confirmar" mais).
 */
export async function findPendingAppointmentForPhone(
  supabase: SupabaseClient,
  clinicId: string,
  phone: string
): Promise<Appointment | null> {
  const { data } = await supabase
    .from("appointments")
    .select("*")
    .eq("clinic_id", clinicId)
    .eq("status", "agendado")
    .in("patient_phone", brPhoneVariants(phone))
    .gte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as Appointment) ?? null;
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
