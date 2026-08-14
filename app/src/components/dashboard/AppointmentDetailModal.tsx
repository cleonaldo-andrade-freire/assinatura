"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useEscapeToClose } from "@/lib/useEscapeToClose";
import { AppointmentDetailBody } from "@/components/dashboard/AppointmentDetailBody";
import type { Appointment, AppointmentEvent } from "@/lib/database.types";
import uiStyles from "@/components/ui/ui.module.css";

/**
 * Mesmo detalhe de agendamento da agenda (`AppointmentDetailBody`), só que
 * aberto como modal client-side em vez de via rota interceptada — a
 * interceptação (`agenda/@modal/(.)[id]`) só funciona pra navegação que
 * parte de dentro da própria agenda; daqui (aba Agendamentos da ficha do
 * paciente) ela não alcança, então busca os dados por fetch.
 */
export function AppointmentDetailModal({
  open,
  onClose,
  clinicId,
  appointmentId,
}: {
  open: boolean;
  onClose: () => void;
  clinicId: string;
  appointmentId: string | null;
}) {
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [events, setEvents] = useState<AppointmentEvent[]>([]);
  const [loading, setLoading] = useState(false);

  useEscapeToClose(onClose, open);

  const load = useCallback(() => {
    if (!appointmentId) return;
    setLoading(true);
    fetch(`/api/clinics/${clinicId}/appointments/${appointmentId}`)
      .then((res) => res.json())
      .then((data) => {
        setAppointment((data.appointment as Appointment) ?? null);
        setEvents((data.events as AppointmentEvent[]) ?? []);
      })
      .finally(() => setLoading(false));
  }, [clinicId, appointmentId]);

  useEffect(() => {
    if (!open) return;
    setAppointment(null);
    setEvents([]);
    load();
  }, [open, load]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className={uiStyles.overlay} onClick={onClose}>
      <div className={`${uiStyles.dialog} ${uiStyles.dialogTall}`} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14, flexShrink: 0 }}>
          <h3 className={uiStyles.dialogTitle}>Agendamento</h3>
          <button type="button" className={uiStyles.toastClose} onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12, paddingRight: 6 }}>
          {loading && !appointment ? (
            <p style={{ color: "var(--ink-soft)", fontSize: 13.5 }}>Carregando…</p>
          ) : appointment ? (
            <AppointmentDetailBody clinicId={clinicId} appointment={appointment} events={events} compact onChanged={load} />
          ) : (
            <p style={{ color: "var(--ink-soft)", fontSize: 13.5 }}>Agendamento não encontrado.</p>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
