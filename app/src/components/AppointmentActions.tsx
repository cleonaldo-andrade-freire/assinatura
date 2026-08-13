"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ToastStack, useToasts } from "@/components/ui/Toast";
import { buildDaySlotTimes } from "@/lib/appointments";
import { formatBRTime } from "@/lib/date";
import type { AppointmentStatus } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

export function AppointmentActions({
  clinicId,
  appointmentId,
  status,
  urgent,
  scheduledAt,
}: {
  clinicId: string;
  appointmentId: string;
  status: AppointmentStatus;
  urgent: boolean;
  scheduledAt: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [newDate, setNewDate] = useState(scheduledAt.slice(0, 10));
  const [newTime, setNewTime] = useState(scheduledAt);
  const { toasts, push, dismiss } = useToasts();

  async function patch(body: Record<string, unknown>, successMessage?: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/appointments/${appointmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        push(data.message || data.error || "Falha ao atualizar o agendamento.");
        return false;
      }
      if (successMessage) push(successMessage, "success");
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function handleReschedule(e: React.FormEvent) {
    e.preventDefault();
    const ok = await patch({ scheduled_at: newTime }, "Agendamento remarcado.");
    if (ok) setRescheduling(false);
  }

  const slots = buildDaySlotTimes(newDate);
  const isTerminal = status === "atendido" || status === "cancelado_paciente" || status === "cancelado_dentista";

  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {status !== "confirmado" && !isTerminal && (
          <button type="button" disabled={busy} onClick={() => patch({ status: "confirmado" }, "Agendamento confirmado.")} className={`${styles.btn} ${styles.btnPrimary}`}>
            Confirmar
          </button>
        )}
        {status !== "atendido" && !isTerminal && (
          <button type="button" disabled={busy} onClick={() => patch({ status: "atendido" }, "Marcado como atendido.")} className={`${styles.btn} ${styles.btnGhost}`}>
            Marcar como atendido
          </button>
        )}
        {!isTerminal && (
          <button
            type="button"
            disabled={busy}
            onClick={() => patch({ status: "cancelado_dentista" }, "Agendamento cancelado — horário liberado.")}
            className={`${styles.btn} ${styles.btnDanger}`}
          >
            Cancelar
          </button>
        )}
        {!isTerminal && (
          <button type="button" disabled={busy} onClick={() => setRescheduling((v) => !v)} className={`${styles.btn} ${styles.btnGhost}`}>
            Remarcar
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => patch({ urgent: !urgent }, urgent ? "Urgência removida." : "Marcado como urgente.")}
          className={`${styles.btn} ${styles.btnGhost}`}
        >
          {urgent ? "Remover urgência" : "Marcar como urgente"}
        </button>
      </div>

      {isTerminal && (
        <p style={{ color: "var(--ink-faint)", fontSize: 12.5, margin: "10px 0 0" }}>
          {status === "atendido" ? "Consulta já concluída — sem mais ações de status." : "Horário liberado — crie um novo agendamento pra realocá-lo."}
        </p>
      )}

      {rescheduling && (
        <form onSubmit={handleReschedule} style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
          <div className={styles.formRow}>
            <div className={styles.field}>
              <label htmlFor="rescheduleDate" className={styles.label}>
                Nova data
              </label>
              <input
                id="rescheduleDate"
                type="date"
                className={styles.input}
                value={newDate}
                onChange={(e) => {
                  setNewDate(e.target.value);
                  setNewTime("");
                }}
                required
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="rescheduleTime" className={styles.label}>
                Novo horário
              </label>
              <select id="rescheduleTime" className={styles.select} value={newTime} onChange={(e) => setNewTime(e.target.value)} required>
                <option value="">Selecione…</option>
                {slots.map((s) => (
                  <option key={s} value={s}>
                    {formatBRTime(s)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className={styles.formActions}>
            <button type="submit" disabled={busy || !newTime} className={`${styles.btn} ${styles.btnPrimary}`}>
              Confirmar remarcação
            </button>
          </div>
        </form>
      )}

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
