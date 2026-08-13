"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ToastStack, useToasts } from "@/components/ui/Toast";
import {
  APPOINTMENT_SLOT_MINUTES,
  APPOINTMENT_STATUS_CLASS,
  APPOINTMENT_STATUS_SYMBOL,
  buildContinuationMap,
  buildDaySlotTimes,
  slotKey,
} from "@/lib/appointments";
import { formatBRDate, formatBRTime } from "@/lib/date";
import { NewAppointmentModal } from "@/components/NewAppointmentModal";
import { PatientAvatar } from "@/components/PatientAvatar";
import type { Appointment } from "@/lib/database.types";
import shellStyles from "@/styles/shell.module.css";

const WEEKDAY_LABEL = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

// Só faz sentido arrastar (remarcar) ou redimensionar (mudar duração) um
// agendamento que ainda vai acontecer — atendido/cancelado/falta ficam
// parados no lugar.
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

  // Redimensionar arrastando a borda inferior do card: só muda duração
  // (nunca scheduled_at) — não é uma remarcação. resizePreviewSlots é o
  // tamanho "ao vivo" enquanto o ponteiro está sendo arrastado, antes de
  // soltar e confirmar no servidor.
  const [resizingId, setResizingId] = useState<string | null>(null);
  const [resizePreviewSlots, setResizePreviewSlots] = useState<number | null>(null);

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

  async function handleResizeCommit(appointmentId: string, durationMinutes: number) {
    setMoving(true);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/appointments/${appointmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ duration_minutes: durationMinutes }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        push(data?.message || data?.error || "Falha ao ajustar a duração — tente pela tela de detalhe.");
        return;
      }
      push("Duração ajustada.", "success");
      router.refresh();
    } finally {
      setMoving(false);
    }
  }

  /** Quantos slots de 30min dá pra esticar a partir de `startSlotIndex` no dia
   * `d`, sem invadir o início de outro agendamento — pra que o "solto" do
   * redimensionamento nunca proponha um valor que o servidor vai recusar por
   * conflito de horário. */
  function maxExtendableSlots(d: string, startSlotIndex: number): number {
    const times = dayTimes.get(d)!;
    let count = 1;
    for (let i = startSlotIndex + 1; i < times.length; i++) {
      const occupiedByOther = (bySlot.get(times[i])?.length ?? 0) > 0;
      if (occupiedByOther) break;
      count++;
    }
    return count;
  }

  function handleResizeStart(
    e: React.PointerEvent,
    appointment: Appointment,
    originalSlots: number,
    maxSlots: number
  ) {
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const cellEl = (e.currentTarget as HTMLElement).parentElement;
    const slotPx = (cellEl?.offsetHeight ?? 44 * originalSlots) / originalSlots;
    setResizingId(appointment.id);
    setResizePreviewSlots(originalSlots);

    function clamp(slots: number) {
      return Math.min(maxSlots, Math.max(1, slots));
    }

    function onMove(ev: PointerEvent) {
      const deltaSlots = Math.round((ev.clientY - startY) / slotPx);
      setResizePreviewSlots(clamp(originalSlots + deltaSlots));
    }
    function onUp(ev: PointerEvent) {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const deltaSlots = Math.round((ev.clientY - startY) / slotPx);
      const finalSlots = clamp(originalSlots + deltaSlots);
      setResizingId(null);
      setResizePreviewSlots(null);
      if (finalSlots !== originalSlots) {
        handleResizeCommit(appointment.id, finalSlots * APPOINTMENT_SLOT_MINUTES);
      }
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
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

                // Célula coberta por um agendamento que começou numa linha
                // anterior — não renderiza nada aqui: o card que começou
                // antes ocupa esse espaço via `grid-row: span`, cobrindo
                // esta célula visualmente (auto-placement do CSS Grid pula
                // células já reservadas por um span, então as colunas
                // seguintes continuam caindo no lugar certo).
                if (continuedBy) return null;

                const empty = items.length === 0;
                // Horário que já passou não pode virar agendamento novo nem
                // receber um card arrastado — mesma regra do servidor, só que
                // aqui evita nem oferecer a interação.
                const isPast = new Date(slot).getTime() < Date.now();
                const interactive = empty && !isPast;
                const cellKey = `${d}-${slotIndex}`;
                const droppable = interactive && draggingId && !moving;

                // Card único ocupando a célula: pode esticar pra baixo
                // representando a duração real (60min = 2 slots, etc.) e
                // ganha a alça de redimensionar. Duas consultas exatamente
                // no mesmo horário (não deveria acontecer — o banco recusa
                // sobreposição pro mesmo profissional) caem no fallback
                // empilhado de sempre, sem span.
                const single = items.length === 1 ? items[0] : null;
                const maxSlots = single ? maxExtendableSlots(d, slotIndex) : 1;
                const naturalSlots = single
                  ? Math.min(maxSlots, Math.max(1, Math.round(single.duration_minutes / APPOINTMENT_SLOT_MINUTES)))
                  : 1;
                const isResizingThis = single ? resizingId === single.id : false;
                const spanSlots = isResizingThis && resizePreviewSlots ? resizePreviewSlots : naturalSlots;
                const resizable = single ? DRAGGABLE_STATUSES.has(single.status) && !moving : false;

                return (
                  <div
                    key={cellKey}
                    className={`${shellStyles.agendaWeekCell} ${d === today ? shellStyles.today : ""}`}
                    onDoubleClick={interactive && !draggingId ? () => setOpenSlot({ date: d, time: slot }) : undefined}
                    role={interactive ? "button" : undefined}
                    tabIndex={interactive ? 0 : undefined}
                    aria-label={interactive ? `Agendar em ${formatBRDate(slot)} às ${formatBRTime(slot)}` : undefined}
                    onKeyDown={
                      interactive && !draggingId
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
                      gridRow: spanSlots > 1 ? `span ${spanSlots}` : undefined,
                      position: single ? "relative" : undefined,
                      zIndex: isResizingThis ? 2 : undefined,
                      cursor: interactive && !draggingId ? "pointer" : undefined,
                      background: dragOverKey === cellKey ? "var(--brand-tint)" : undefined,
                      outline: dragOverKey === cellKey ? "2px dashed var(--brand)" : undefined,
                      outlineOffset: dragOverKey === cellKey ? "-2px" : undefined,
                    }}
                  >
                    {single &&
                      (() => {
                        const a = single;
                        const draggable = DRAGGABLE_STATUSES.has(a.status) && !moving && !isResizingThis;
                        return (
                          <>
                            <Link
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
                              title={`${a.patient_name} — ${a.status}${a.urgent ? " · urgência" : ""}${draggable ? " (arraste pra remarcar, borda inferior pra mudar duração)" : ""}`}
                              style={{ display: "flex", alignItems: "center", gap: 6, height: "100%", cursor: draggable ? "grab" : undefined }}
                            >
                              <PatientAvatar clinicId={clinicId} patientId={a.patient_id} name={a.patient_name} size={24} />
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.patient_name}</span>
                            </Link>
                            {resizable && (
                              <div
                                className={shellStyles.agendaResizeHandle}
                                draggable={false}
                                onDragStart={(e) => e.preventDefault()}
                                onPointerDown={(e) => handleResizeStart(e, a, naturalSlots, maxSlots)}
                                title="Arraste pra mudar a duração"
                              />
                            )}
                          </>
                        );
                      })()}
                    {items.length > 1 &&
                      items.map((a) => {
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
                            title={`${a.patient_name} — ${a.status}${a.urgent ? " · urgência" : ""}`}
                            style={draggable ? { cursor: "grab" } : undefined}
                          >
                            {APPOINTMENT_STATUS_SYMBOL[a.status]} {a.patient_name}
                          </Link>
                        );
                      })}
                  </div>
                );
              })}
            </Fragment>
          );
        })}
      </div>

      <NewAppointmentModal
        open={!!openSlot}
        onClose={() => setOpenSlot(null)}
        clinicId={clinicId}
        professionalName={professionalName}
        date={openSlot?.date ?? ""}
        time={openSlot?.time}
      />

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </>
  );
}
