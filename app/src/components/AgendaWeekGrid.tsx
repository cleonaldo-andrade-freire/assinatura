"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { APPOINTMENT_STATUS_CLASS, APPOINTMENT_STATUS_SYMBOL, buildContinuationMap, buildDaySlotTimes, slotKey } from "@/lib/appointments";
import { formatBRDate, formatBRTime, formatBRWeekday } from "@/lib/date";
import { NewAppointmentForm } from "@/components/NewAppointmentForm";
import type { Appointment } from "@/lib/database.types";
import shellStyles from "@/styles/shell.module.css";
import uiStyles from "@/components/ui/ui.module.css";

const WEEKDAY_LABEL = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

interface Slot {
  date: string;
  time: string;
}

export function AgendaWeekGrid({
  clinicId,
  professionalName,
  weekDays,
  slotsPerDay,
  today,
  appointments,
}: {
  clinicId: string;
  professionalName: string;
  weekDays: string[];
  /** Quantos slots de 30min por dia (mesmo pra todos os dias — a grade não varia por dia da semana). */
  slotsPerDay: number;
  today: string;
  appointments: Appointment[];
}) {
  const bySlot = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const a of appointments) {
      const key = slotKey(a.scheduled_at);
      const list = map.get(key) ?? [];
      list.push(a);
      map.set(key, list);
    }
    return map;
  }, [appointments]);

  const dayTimes = useMemo(() => new Map(weekDays.map((d) => [d, buildDaySlotTimes(d)])), [weekDays]);

  // Igual à visão diária: uma consulta de 60min ocupa 2 slots de 30 — sem
  // isso, o segundo apareceria "vago" e clicável, quando na prática já está
  // ocupado (o backend recusaria um novo agendamento ali).
  const continuationSlots = useMemo(() => {
    const allSlots = weekDays.flatMap((d) => dayTimes.get(d)!);
    return buildContinuationMap(appointments, allSlots);
  }, [appointments, weekDays, dayTimes]);

  const [openSlot, setOpenSlot] = useState<Slot | null>(null);

  useEffect(() => {
    if (!openSlot) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenSlot(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openSlot]);

  return (
    <>
      <div className={shellStyles.agendaWeekGrid}>
        <div className={shellStyles.agendaWeekHeaderCell} />
        {weekDays.map((d) => (
          <div key={d} className={`${shellStyles.agendaWeekHeaderCell} ${d === today ? shellStyles.today : ""}`}>
            {WEEKDAY_LABEL[new Date(`${d}T12:00:00-03:00`).getUTCDay()]} {d.split("-")[2]}
          </div>
        ))}

        {Array.from({ length: slotsPerDay }, (_, slotIndex) => {
          const hour = 8 + Math.floor(slotIndex / 2);
          const minute = slotIndex % 2 === 0 ? "00" : "30";
          return (
            <Fragment key={`row-${slotIndex}`}>
              <div className={shellStyles.agendaWeekTimeCell}>
                {minute === "00" ? `${String(hour).padStart(2, "0")}:00` : ""}
              </div>
              {weekDays.map((d) => {
                const slot = dayTimes.get(d)![slotIndex];
                const items = bySlot.get(slot) ?? [];
                const continuedBy = items.length === 0 ? continuationSlots.get(slot) : undefined;
                const empty = items.length === 0 && !continuedBy;
                return (
                  <div
                    key={`${d}-${slotIndex}`}
                    className={shellStyles.agendaWeekCell}
                    onDoubleClick={empty ? () => setOpenSlot({ date: d, time: slot }) : undefined}
                    role={empty ? "button" : undefined}
                    tabIndex={empty ? 0 : undefined}
                    aria-label={empty ? `Agendar em ${formatBRDate(slot)} às ${formatBRTime(slot)}` : undefined}
                    onKeyDown={
                      empty
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setOpenSlot({ date: d, time: slot });
                            }
                          }
                        : undefined
                    }
                    style={empty ? { cursor: "pointer" } : undefined}
                  >
                    {items.map((a) => (
                      <Link
                        key={a.id}
                        href={`/dashboard/agenda/${a.id}`}
                        className={`${shellStyles.agendaWeekChip} ${shellStyles.statusBadge} ${shellStyles[APPOINTMENT_STATUS_CLASS[a.status]]} ${a.urgent ? shellStyles.urgentMark : ""}`}
                        title={`${a.patient_name} — ${a.status}${a.urgent ? " · urgência" : ""}`}
                      >
                        {APPOINTMENT_STATUS_SYMBOL[a.status]} {a.patient_name}
                      </Link>
                    ))}
                    {continuedBy && (
                      <Link
                        href={`/dashboard/agenda/${continuedBy.id}`}
                        className={shellStyles.agendaWeekChip}
                        style={{ color: "var(--ink-faint)", background: "var(--surface-sunken)" }}
                        title={`${continuedBy.patient_name} — continuação`}
                      >
                        ↳ continua
                      </Link>
                    )}
                  </div>
                );
              })}
            </Fragment>
          );
        })}
      </div>

      {openSlot &&
        typeof document !== "undefined" &&
        createPortal(
          <div className={uiStyles.overlay} onClick={() => setOpenSlot(null)}>
            <div
              className={`${uiStyles.dialog} ${uiStyles.dialogWide}`}
              role="dialog"
              aria-modal="true"
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
                <div>
                  <h3 className={uiStyles.dialogTitle}>Novo agendamento</h3>
                  <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--ink-soft)" }}>
                    {formatBRWeekday(`${openSlot.date}T12:00:00-03:00`, "long")}, {formatBRDate(`${openSlot.date}T12:00:00-03:00`)} às{" "}
                    {formatBRTime(openSlot.time)}
                  </p>
                </div>
                <button type="button" className={uiStyles.toastClose} onClick={() => setOpenSlot(null)} aria-label="Fechar">
                  ×
                </button>
              </div>
              <NewAppointmentForm
                bare
                clinicId={clinicId}
                professionalName={professionalName}
                initialDate={openSlot.date}
                initialTime={openSlot.time}
                onSuccess={() => setOpenSlot(null)}
              />
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
