import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ClinicShell } from "@/components/clinic/ClinicShell";
import { AppointmentStatusBadge, UrgentBadge } from "@/components/AppointmentStatusBadge";
import { AgendaWeekGrid } from "@/components/AgendaWeekGrid";
import { buildDaySlotTimes } from "@/lib/appointments";
import { addDaysToDateStr, brDateOnly, brDayRangeUtc, formatBRTime, formatBRWeekday, mondayOfWeek } from "@/lib/date";
import type { Appointment } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

export default async function AgendaPage({ searchParams }: { searchParams: { date?: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic) redirect("/login");

  const today = brDateOnly();
  const date = searchParams.date && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date) ? searchParams.date : today;

  const weekStart = mondayOfWeek(date);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDaysToDateStr(weekStart, i));
  const weekEnd = addDaysToDateStr(weekStart, 7);

  // Sempre busca a semana inteira (nunca a tabela toda) — cobre a visão
  // diária (mobile, um recorte dessa mesma semana) e a semanal (desktop) com
  // uma única consulta, sem paginar por status nem por profissional.
  const { fromIso } = brDayRangeUtc(weekStart);
  const { fromIso: toIso } = brDayRangeUtc(weekEnd);
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
    const list = bySlot.get(a.scheduled_at) ?? [];
    list.push(a);
    bySlot.set(a.scheduled_at, list);
  }

  const daySlots = buildDaySlotTimes(date);
  const prevDay = addDaysToDateStr(date, -1);
  const nextDay = addDaysToDateStr(date, 1);
  const prevWeek = addDaysToDateStr(weekStart, -7);
  const nextWeek = addDaysToDateStr(weekStart, 7);
  const weekEndDisplay = addDaysToDateStr(weekStart, 6);

  return (
    <ClinicShell
      clinicName={clinic.name}
      clinicLogoUrl={clinic.logo_url}
      title="Agenda"
      subtitle="Agendamentos da clínica"
      actions={
        <Link href={`/dashboard/agenda/new?date=${date}`} className={`${styles.btn} ${styles.btnPrimary}`}>
          + Novo agendamento
        </Link>
      }
    >
      {/* ---- diária, só visível no celular (ver media query em .agendaWeekView) ---- */}
      <div className={styles.agendaDayView}>
        <div className={styles.agendaNav}>
          <Link href={`/dashboard/agenda?date=${prevDay}`} className={styles.agendaNavArrow} aria-label="Dia anterior">
            ‹
          </Link>
          <span className={styles.agendaNavLabel}>
            {date === today ? "Hoje · " : ""}
            {formatBRWeekday(`${date}T12:00:00-03:00`, "long")}, {date.split("-").reverse().slice(0, 2).join("/")}
          </span>
          <Link href={`/dashboard/agenda?date=${nextDay}`} className={styles.agendaNavArrow} aria-label="Próximo dia">
            ›
          </Link>
        </div>

        <div className={styles.panel}>
          <div className={styles.panelBody}>
            {daySlots.map((slot) => {
              const items = bySlot.get(slot) ?? [];
              return (
                <div key={slot} className={styles.agendaSlot}>
                  <div className={styles.agendaSlotTime}>{formatBRTime(slot)}</div>
                  <div className={styles.agendaSlotBody}>
                    {items.length === 0 ? (
                      <Link href={`/dashboard/agenda/new?date=${date}&time=${encodeURIComponent(slot)}`} className={styles.agendaEmptySlot}>
                        vago — toque pra agendar
                      </Link>
                    ) : (
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
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ---- semanal, só visível em telas ≥860px ---- */}
      <div className={styles.agendaWeekView}>
        <div className={styles.agendaNav}>
          <Link href={`/dashboard/agenda?date=${prevWeek}`} className={styles.agendaNavArrow} aria-label="Semana anterior">
            ‹
          </Link>
          <span className={styles.agendaNavLabel}>
            Semana de {weekStart.split("-").reverse().slice(0, 2).join("/")} a {weekEndDisplay.split("-").reverse().slice(0, 2).join("/")}
          </span>
          <Link href={`/dashboard/agenda?date=${nextWeek}`} className={styles.agendaNavArrow} aria-label="Próxima semana">
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
      </div>
    </ClinicShell>
  );
}
