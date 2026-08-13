import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ClinicShell } from "@/components/clinic/ClinicShell";
import { AppointmentStatusBadge, NeedsFollowUpBadge, UrgentBadge } from "@/components/AppointmentStatusBadge";
import { AgendaWeekGrid } from "@/components/AgendaWeekGrid";
import { AgendaRealtimeRefresh } from "@/components/AgendaRealtimeRefresh";
import { AgendaLegend } from "@/components/AgendaLegend";
import {
  APPOINTMENT_STATUS_DOT_COLOR,
  buildContinuationMap,
  buildDaySlotTimes,
  needsManualFollowUp,
  slotKey,
  summarizeAppointmentsByDay,
} from "@/lib/appointments";
import {
  addDaysToDateStr,
  brDateOnly,
  brDayRangeUtc,
  formatBRTime,
  formatBRWeekday,
  mondayOfWeek,
  monthGridDays,
} from "@/lib/date";
import type { Appointment } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

const WEEKDAY_LABEL = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MONTH_LABEL = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function brDisplay(dateStr: string): string {
  return dateStr.split("-").reverse().slice(0, 2).join("/");
}

export default async function AgendaPage({ searchParams }: { searchParams: { date?: string; view?: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic) redirect("/login");

  const today = brDateOnly();
  const date = searchParams.date && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date) ? searchParams.date : today;
  const view = searchParams.view === "month" ? "month" : "week";

  const weekStart = mondayOfWeek(date);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDaysToDateStr(weekStart, i));
  const weekEnd = addDaysToDateStr(weekStart, 7);

  const monthDays = monthGridDays(date);
  const monthRangeEnd = addDaysToDateStr(monthDays[monthDays.length - 1], 1);

  // Só busca o período que a visão ativa precisa (nunca a tabela toda): a
  // semanal cobre a diária do celular de graça (é um recorte dela); a
  // mensal busca a grade do mês (incluindo os dias de encaixe do mês
  // vizinho) numa consulta só.
  const rangeStart = view === "month" ? monthDays[0] : weekStart;
  const rangeEnd = view === "month" ? monthRangeEnd : weekEnd;
  const { fromIso } = brDayRangeUtc(rangeStart);
  const { fromIso: toIso } = brDayRangeUtc(rangeEnd);

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("appointments")
    .select("*")
    .eq("clinic_id", clinic.id)
    .gte("scheduled_at", fromIso)
    .lt("scheduled_at", toIso)
    .order("scheduled_at", { ascending: true });
  const appointments = (data as Appointment[]) ?? [];

  const bySlot = new Map<string, Appointment[]>();
  for (const a of appointments) {
    const key = slotKey(a.scheduled_at);
    const list = bySlot.get(key) ?? [];
    list.push(a);
    bySlot.set(key, list);
  }

  const daySlots = buildDaySlotTimes(date);
  const continuationSlots = buildContinuationMap(appointments, daySlots);
  const prevDay = addDaysToDateStr(date, -1);
  const nextDay = addDaysToDateStr(date, 1);
  const prevWeek = addDaysToDateStr(weekStart, -7);
  const nextWeek = addDaysToDateStr(weekStart, 7);
  const weekEndDisplay = addDaysToDateStr(weekStart, 6);

  const [year, month] = date.split("-").map(Number);
  const prevMonthDate = addDaysToDateStr(monthDays[0], -1);
  const nextMonthDate = monthRangeEnd;
  const daySummary = view === "month" ? summarizeAppointmentsByDay(appointments) : new Map();

  function viewHref(v: "week" | "month") {
    return `/dashboard/agenda?date=${date}&view=${v}`;
  }

  return (
    <ClinicShell
      clinicName={clinic.name}
      clinicLogoUrl={clinic.logo_url}
      title="Agenda"
      subtitle="Agendamentos da clínica"
      actions={
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {/* alternância semana/mês não faz sentido no celular (só existe visão diária lá) */}
          <div className={styles.agendaDesktopView}>
            <span className={styles.viewToggle}>
              <Link href={viewHref("week")} className={`${styles.viewToggleBtn} ${view === "week" ? styles.viewToggleBtnActive : ""}`}>
                Semana
              </Link>
              <Link href={viewHref("month")} className={`${styles.viewToggleBtn} ${view === "month" ? styles.viewToggleBtnActive : ""}`}>
                Mês
              </Link>
            </span>
          </div>
          <Link href={`/dashboard/agenda/new?date=${date}`} className={`${styles.btn} ${styles.btnPrimary}`}>
            + Novo agendamento
          </Link>
        </div>
      }
    >
      <AgendaRealtimeRefresh clinicId={clinic.id} />

      {/* ---- diária, só visível no celular ---- */}
      <div className={styles.agendaDayView}>
        <div className={styles.agendaNav}>
          <Link href={`/dashboard/agenda?date=${prevDay}`} className={styles.agendaNavArrow} aria-label="Dia anterior">
            ‹
          </Link>
          <span className={styles.agendaNavLabel}>
            {date === today ? "Hoje · " : ""}
            {formatBRWeekday(`${date}T12:00:00-03:00`, "long")}, {brDisplay(date)}
          </span>
          <Link href={`/dashboard/agenda?date=${nextDay}`} className={styles.agendaNavArrow} aria-label="Próximo dia">
            ›
          </Link>
        </div>

        <div className={styles.panel}>
          <div className={styles.panelBody}>
            {daySlots.map((slot) => {
              const items = bySlot.get(slot) ?? [];
              const continuedBy = continuationSlots.get(slot);
              return (
                <div key={slot} className={styles.agendaSlot}>
                  <div className={styles.agendaSlotTime}>{formatBRTime(slot)}</div>
                  <div className={styles.agendaSlotBody}>
                    {items.length > 0 ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {items.map((a) => (
                          <Link
                            key={a.id}
                            href={`/dashboard/agenda/${a.id}`}
                            className={`${styles.agendaCard} ${a.urgent ? styles.urgentMark : ""}`}
                          >
                            <div className={styles.agendaCardName}>{a.patient_name}</div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                              <AppointmentStatusBadge status={a.status} />
                              {a.urgent && <UrgentBadge />}
                              {needsManualFollowUp(a) && <NeedsFollowUpBadge />}
                              <span style={{ fontSize: 12, color: "var(--ink-faint)" }}>{a.duration_minutes} min</span>
                            </div>
                          </Link>
                        ))}
                      </div>
                    ) : continuedBy ? (
                      // Slot ocupado por uma consulta mais longa que começou antes
                      // (ex.: 60min às 9h cobre também o slot das 9h30) — não é
                      // "vago" de verdade, então não oferece criar outro agendamento
                      // aqui em cima.
                      <Link href={`/dashboard/agenda/${continuedBy.id}`} className={styles.agendaContinuation}>
                        ↳ {continuedBy.patient_name} (continuação)
                      </Link>
                    ) : (
                      <Link href={`/dashboard/agenda/new?date=${date}&time=${encodeURIComponent(slot)}`} className={styles.agendaEmptySlot}>
                        vago — toque pra agendar
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ---- semanal ou mensal, só visível em telas ≥860px ---- */}
      <div className={styles.agendaDesktopView}>
        <AgendaLegend />
        {view === "week" ? (
          <>
            <div className={styles.agendaNav}>
              <Link href={`/dashboard/agenda?date=${prevWeek}&view=week`} className={styles.agendaNavArrow} aria-label="Semana anterior">
                ‹
              </Link>
              <span className={styles.agendaNavLabel}>
                Semana de {brDisplay(weekStart)} a {brDisplay(weekEndDisplay)}
              </span>
              <Link href={`/dashboard/agenda?date=${nextWeek}&view=week`} className={styles.agendaNavArrow} aria-label="Próxima semana">
                ›
              </Link>
            </div>

            <AgendaWeekGrid
              clinicId={clinic.id}
              professionalName={clinic.dentist_name || clinic.name}
              weekDays={weekDays}
              slotsPerDay={daySlots.length}
              today={today}
              appointments={appointments}
            />
          </>
        ) : (
          <>
            <div className={styles.agendaNav}>
              <Link href={`/dashboard/agenda?date=${prevMonthDate}&view=month`} className={styles.agendaNavArrow} aria-label="Mês anterior">
                ‹
              </Link>
              <span className={styles.agendaNavLabel}>
                {MONTH_LABEL[month - 1]} de {year}
              </span>
              <Link href={`/dashboard/agenda?date=${nextMonthDate}&view=month`} className={styles.agendaNavArrow} aria-label="Próximo mês">
                ›
              </Link>
            </div>

            <div className={styles.agendaMonthGrid}>
              {WEEKDAY_LABEL.slice(1).concat(WEEKDAY_LABEL[0]).map((w) => (
                <div key={w} className={styles.agendaWeekHeaderCell}>
                  {w}
                </div>
              ))}
              {monthDays.map((d) => {
                const outside = d.slice(0, 7) !== date.slice(0, 7);
                const summary = daySummary.get(d);
                const cellClass = `${styles.agendaMonthCell} ${outside ? styles.outside : ""} ${d === today ? styles.today : ""}`;
                const content = (
                  <>
                    <div className={styles.agendaMonthDayNum}>
                      {Number(d.slice(8, 10))}
                      {summary?.anyUrgent && <UrgentBadge />}
                    </div>
                    {summary && summary.total > 0 && (
                      <>
                        <div className={styles.agendaMonthSummary}>
                          {Object.keys(summary.byStatus).map((status) => (
                            <span
                              key={status}
                              className={styles.agendaMonthDot}
                              style={{ background: APPOINTMENT_STATUS_DOT_COLOR[status as keyof typeof APPOINTMENT_STATUS_DOT_COLOR] }}
                            />
                          ))}
                        </div>
                        <span className={styles.agendaMonthCount}>
                          {summary.total} agendamento{summary.total === 1 ? "" : "s"}
                        </span>
                      </>
                    )}
                  </>
                );
                // Dias de encaixe do mês vizinho não navegam pra lugar nenhum —
                // <div> em vez de <Link>, pra não deixar um link fantasma
                // focável por teclado que só leva pro topo da página.
                return outside ? (
                  <div key={d} className={cellClass}>
                    {content}
                  </div>
                ) : (
                  <Link key={d} href={`/dashboard/agenda?date=${d}&view=week`} className={cellClass}>
                    {content}
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </div>
    </ClinicShell>
  );
}
