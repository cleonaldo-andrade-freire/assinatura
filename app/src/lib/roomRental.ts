import { rangesOverlap } from "@/lib/appointments";
import type { RoomRental, RoomRentalShift, RoomTenant } from "@/lib/database.types";

/**
 * Locação da sala por turno (migration 073, design em
 * docs/superpowers/specs/2026-10-12-locacao-consultorio-design.md) — só a
 * parte pura: horários, quadro da semana e "a receber". Acesso a banco e
 * autenticação ficam em roomRentalServer.ts.
 */

/** Semeados na primeira abertura da tela, quando a clínica ainda não tem turno nenhum. */
export const DEFAULT_SHIFTS: Pick<RoomRentalShift, "name" | "start_time" | "end_time" | "sort_order">[] = [
  { name: "Manhã", start_time: "08:00", end_time: "12:00", sort_order: 1 },
  { name: "Tarde", start_time: "14:00", end_time: "18:00", sort_order: 2 },
  { name: "Noite", start_time: "18:00", end_time: "22:00", sort_order: 3 },
];

/** "07:00:00" ou "07:00" → "07:00". */
export function shortTime(t: string): string {
  return t.slice(0, 5);
}

/**
 * Faixa UTC de um turno numa data. Offset fixo -03:00, mesmo motivo de
 * `brDayRangeUtc` (lib/date.ts): o Brasil não tem mais horário de verão.
 */
export function shiftRange(dateStr: string, shift: Pick<RoomRentalShift, "start_time" | "end_time">): { startsAt: string; endsAt: string } {
  return {
    startsAt: new Date(`${dateStr}T${shortTime(shift.start_time)}:00-03:00`).toISOString(),
    endsAt: new Date(`${dateStr}T${shortTime(shift.end_time)}:00-03:00`).toISOString(),
  };
}

/** Consulta só com o que o quadro precisa — o horário, nunca o paciente. */
export interface BusyInterval {
  scheduled_at: string;
  ends_at: string;
}

export type GridCell =
  | { kind: "livre" }
  | { kind: "alugada"; rental: RoomRental }
  | { kind: "clinica"; appointmentCount: number };

/**
 * Situação de cada (dia, turno) da semana. Locação ganha de consulta na
 * exibição — os triggers da 073 impedem as duas no mesmo horário, então a
 * coincidência só aparece com dado antigo, e aí o aluguel é o compromisso
 * com um terceiro.
 *
 * Chave: `${dateStr}|${shiftId}`.
 */
export function buildWeekGrid(
  days: string[],
  shifts: RoomRentalShift[],
  rentals: RoomRental[],
  appointments: BusyInterval[]
): Map<string, GridCell> {
  const grid = new Map<string, GridCell>();
  const active = rentals.filter((r) => r.status === "agendada");
  for (const day of days) {
    for (const shift of shifts) {
      const { startsAt, endsAt } = shiftRange(day, shift);
      const start = new Date(startsAt);
      const end = new Date(endsAt);
      const rental = active.find((r) => rangesOverlap(start, end, new Date(r.starts_at), new Date(r.ends_at)));
      if (rental) {
        grid.set(`${day}|${shift.id}`, { kind: "alugada", rental });
        continue;
      }
      const appointmentCount = appointments.filter((a) => rangesOverlap(start, end, new Date(a.scheduled_at), new Date(a.ends_at))).length;
      grid.set(`${day}|${shift.id}`, appointmentCount > 0 ? { kind: "clinica", appointmentCount } : { kind: "livre" });
    }
  }
  return grid;
}

/** Locação já usada (data de hoje ou antes), não cancelada e não paga. */
export function isReceivable(rental: Pick<RoomRental, "status" | "paid_at" | "rental_date">, today: string): boolean {
  return rental.status === "agendada" && !rental.paid_at && rental.rental_date <= today;
}

export interface TenantReceivable {
  tenant: Pick<RoomTenant, "id" | "name">;
  rentals: RoomRental[];
  total: number;
}

/** "A receber" agrupado por locatário, maior total primeiro; locações de cada um da mais antiga pra mais nova. */
export function groupReceivables(
  rentals: RoomRental[],
  tenants: Pick<RoomTenant, "id" | "name">[],
  today: string
): TenantReceivable[] {
  const tenantById = new Map(tenants.map((t) => [t.id, t]));
  const groups = new Map<string, TenantReceivable>();
  for (const r of rentals) {
    if (!isReceivable(r, today)) continue;
    const tenant = tenantById.get(r.tenant_id) ?? { id: r.tenant_id, name: "—" };
    const group = groups.get(tenant.id) ?? { tenant, rentals: [], total: 0 };
    group.rentals.push(r);
    group.total += Number(r.amount);
    groups.set(tenant.id, group);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, rentals: [...g.rentals].sort((a, b) => a.starts_at.localeCompare(b.starts_at)) }))
    .sort((a, b) => b.total - a.total);
}

/**
 * Traduz os conflitos do banco (constraint room_rentals_no_overlap e os
 * triggers da 073 — todos com código 23P01) numa mensagem pra tela, ou
 * `null` se o erro for outro.
 */
export function rentalConflictMessage(error: { code?: string; message?: string } | null | undefined): string | null {
  if (error?.code !== "23P01") return null;
  if (error.message?.includes("room_rental_appointment_conflict")) {
    return "Há consulta marcada na agenda nesse turno — desmarque ou remarque antes de alugar a sala.";
  }
  return "A sala já está alugada nesse horário.";
}

/** Mensagem do lado da agenda quando o trigger da 073 recusa a consulta, ou `null` se o conflito for outro. */
export function appointmentRoomRentedMessage(error: { code?: string; message?: string } | null | undefined): string | null {
  if (error?.code === "23P01" && error.message?.includes("room_rented")) {
    return "A sala está alugada nesse horário (Locação da sala) — escolha outro horário.";
  }
  return null;
}

/** Locação como a Agenda mostra: horário, quem alugou e qual turno. */
export interface AgendaRental {
  id: string;
  rental_date: string;
  starts_at: string;
  ends_at: string;
  tenantName: string;
  shiftName: string;
}

export interface RentalSlot<T> {
  rental: T;
  /** Primeiro slot da grade coberto pela locação — é onde o bloco é desenhado. */
  first: boolean;
  /** Quantos slots da grade a locação cobre (só significativo em `first`). */
  span: number;
}

/**
 * Slot da agenda → locação que o cobre (`[starts_at, ends_at)`). Na agenda a
 * locação ganha da consulta pelo mesmo motivo de `buildWeekGrid`: os triggers
 * da 073 impedem as duas no mesmo horário, então só sobra consulta cancelada
 * ali embaixo. Turno que passa do fim da grade (Noite até 22h numa grade que
 * vai até 21h) cobre só os slots que existem.
 */
export function buildRentalSlotMap<T extends Pick<AgendaRental, "starts_at" | "ends_at">>(
  rentals: T[],
  slots: string[]
): Map<string, RentalSlot<T>> {
  const map = new Map<string, RentalSlot<T>>();
  for (const r of rentals) {
    const start = new Date(r.starts_at).getTime();
    const end = new Date(r.ends_at).getTime();
    const covered = slots.filter((s) => {
      const t = new Date(s).getTime();
      return t >= start && t < end;
    });
    covered.forEach((s, i) => map.set(s, { rental: r, first: i === 0, span: covered.length }));
  }
  return map;
}
