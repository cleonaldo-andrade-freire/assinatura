"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { formatBRDate, formatBRTime, formatBRWeekday } from "@/lib/date";
import { NewAppointmentForm } from "@/components/NewAppointmentForm";
import type { Appointment } from "@/lib/database.types";
import uiStyles from "@/components/ui/ui.module.css";

/**
 * Diálogo de "Novo agendamento" único, usado tanto pelo duplo clique na
 * grade semanal quanto pelo botão "+ Novo agendamento" e pelos slots vagos
 * da visão diária — um só lugar pra manter a marcação padronizada em toda a
 * agenda, em vez de misturar modal num fluxo e página cheia no outro.
 */
export function NewAppointmentModal({
  open,
  onClose,
  clinicId,
  professionalName,
  date,
  time,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  clinicId: string;
  professionalName: string;
  date: string;
  time?: string;
  onCreated?: (appointment: Appointment) => void;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className={uiStyles.overlay} onClick={onClose}>
      <div className={`${uiStyles.dialog} ${uiStyles.dialogWide}`} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14, flexShrink: 0 }}>
          <div>
            <h3 className={uiStyles.dialogTitle}>Novo agendamento</h3>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--ink-soft)" }}>
              {formatBRWeekday(`${date}T12:00:00-03:00`, "long")}, {formatBRDate(`${date}T12:00:00-03:00`)}
              {time ? ` às ${formatBRTime(time)}` : ""}
            </p>
          </div>
          <button type="button" className={uiStyles.toastClose} onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>
        <NewAppointmentForm
          bare
          clinicId={clinicId}
          professionalName={professionalName}
          initialDate={date}
          initialTime={time}
          onSuccess={(appointment) => {
            onClose();
            onCreated?.(appointment);
          }}
        />
      </div>
    </div>,
    document.body
  );
}
