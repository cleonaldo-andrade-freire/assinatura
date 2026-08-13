"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ToastStack, useToasts } from "@/components/ui/Toast";
import { APPOINTMENT_STATUS_CLASS, APPOINTMENT_STATUS_SYMBOL, buildContinuationMap, buildDaySlotTimes, slotKey } from "@/lib/appointments";
import { formatBRDate, formatBRTime, formatBRWeekday } from "@/lib/date";
import { NewAppointmentForm } from "@/components/NewAppointmentForm";
import type { Appointment } from "@/lib/database.types";
import shellStyles from "@/styles/shell.module.css";
import uiStyles from "@/components/ui/ui.module.css";

const WEEKDAY_LABEL = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

// Só faz sentido arrastar pra remarcar um agendamento que ainda vai
// acontecer — atendido/cancelado/falta ficam parados no lugar.
const DRAGGABLE_STATUSES = new Set(["agendado", "confirmado"]);

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
  const router = useRouter();
  const { toasts, push, dismiss } = useToasts();

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
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    if (!openSlot) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenSlot(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openSlot]);

  async function handleDrop(appointmentId: string, newTime: string) {
    setDragOverKey(null);
    setMoving(true);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/appointments/${appointmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduled_at: newTime }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        push(data?.message || data?.error || "Falha ao remarcar arrastando — tente pela tela de detalhe.");
        return;
      }
      push("Agendamento remarcado.", "success");
      router.refresh();
    } finally {
      setMoving(false);
    }
  }

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
                const cellKey = `${d}-${slotIndex}`;
                const droppable = empty && draggingId && !moving;
                return (
                  <div
                    key={cellKey}
                    className={shellStyles.agendaWeekCell}
                    onDoubleClick={empty && !draggingId ? () => setOpenSlot({ date: d, time: slot }) : undefined}
                    role={empty ? "button" : undefined}
                    tabIndex={empty ? 0 : undefined}
                    aria-label={empty ? `Agendar em ${formatBRDate(slot)} às ${formatBRTime(slot)}` : undefined}
                    onKeyDown={
                      empty && !draggingId
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setOpenSlot({ date: d, time: slot });
                            }
                          }
                        : undefined
                    }
                    onDragOver={
                      droppable
                        ? (e) => {
                            e.preventDefault();
                            if (dragOverKey !== cellKey) setDragOverKey(cellKey);
                          }
                        : undefined
                    }
                    onDragLeave={droppable ? () => setDragOverKey((k) => (k === cellKey ? null : k)) : undefined}
                    onDrop={
                      droppable
                        ? (e) => {
                            e.preventDefault();
                            const id = e.dataTransfer.getData("text/plain");
                            setDraggingId(null);
                            if (id) handleDrop(id, slot);
                          }
                        : undefined
                    }
                    style={{
                      cursor: empty && !draggingId ? "pointer" : undefined,
                      background: dragOverKey === cellKey ? "var(--brand-tint)" : undefined,
                      outline: dragOverKey === cellKey ? "2px dashed var(--brand)" : undefined,
                      outlineOffset: dragOverKey === cellKey ? "-2px" : undefined,
                    }}
                  >
                    {items.map((a) => {
                      const draggable = DRAGGABLE_STATUSES.has(a.status) && !moving;
                      return (
                        <Link
                          key={a.id}
                          href={`/dashboard/agenda/${a.id}`}
                          draggable={draggable}
                          onDragStart={
                            draggable
                              ? (e) => {
                                  e.dataTransfer.setData("text/plain", a.id);
                                  e.dataTransfer.effectAllowed = "move";
                                  setDraggingId(a.id);
                                }
                              : undefined
                          }
                          onDragEnd={() => {
                            setDraggingId(null);
                            setDragOverKey(null);
                          }}
                          className={`${shellStyles.agendaWeekChip} ${shellStyles.statusBadge} ${shellStyles[APPOINTMENT_STATUS_CLASS[a.status]]} ${a.urgent ? shellStyles.urgentMark : ""}`}
                          title={`${a.patient_name} — ${a.status}${a.urgent ? " · urgência" : ""}${draggable ? " (arraste pra remarcar)" : ""}`}
                          style={draggable ? { cursor: "grab" } : undefined}
                        >
                          {APPOINTMENT_STATUS_SYMBOL[a.status]} {a.patient_name}
                        </Link>
                      );
                    })}
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

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </>
  );
}
