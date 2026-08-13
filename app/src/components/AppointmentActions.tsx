"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ToastStack, useToasts } from "@/components/ui/Toast";
import { buildDaySlotTimes, slotKey } from "@/lib/appointments";
import { brDateOnly, formatBRTime } from "@/lib/date";
import type { AppointmentStatus } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120];

export function AppointmentActions({
  clinicId,
  appointmentId,
  status,
  urgent,
  scheduledAt,
  durationMinutes,
}: {
  clinicId: string;
  appointmentId: string;
  status: AppointmentStatus;
  urgent: boolean;
  scheduledAt: string;
  durationMinutes: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  // scheduledAt vem do banco como "...+00:00"; os <option> da grade de
  // horário são gerados via Date.toISOString() ("...000Z") — precisa
  // normalizar pros dois lados baterem, senão o select abre sem nada
  // pré-selecionado (mesmo bug de fundo que fazia o agendamento sumir da
  // grade/lista).
  const [newDate, setNewDate] = useState(brDateOnly(new Date(scheduledAt)));
  const [newTime, setNewTime] = useState(slotKey(scheduledAt));
  const [newDuration, setNewDuration] = useState(durationMinutes);
  const [resending, setResending] = useState(false);
  const { toasts, push, dismiss } = useToasts();

  async function handleResend() {
    setResending(true);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/appointments/${appointmentId}/resend`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        push(data?.error === "send_failed" ? "Falha ao enviar — confira se o WhatsApp da clínica está conectado." : "Falha ao enviar a mensagem.");
        return;
      }
      push("Mensagem de confirmação enviada por WhatsApp.", "success");
    } finally {
      setResending(false);
    }
  }

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
    const ok = await patch({ scheduled_at: newTime, duration_minutes: newDuration }, "Agendamento remarcado.");
    if (ok) setRescheduling(false);
  }

  // Mesma lógica do formulário de criação — filtra horários que já passaram
  // pra não oferecer uma remarcação que o servidor vai recusar.
  const slots = buildDaySlotTimes(newDate).filter((s) => new Date(s).getTime() > Date.now());
  const isTerminal = status === "atendido" || status === "cancelado_paciente" || status === "cancelado_dentista" || status === "faltou";

  useEffect(() => {
    if (newTime && !slots.includes(newTime)) setNewTime("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newDate]);

  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {status === "agendado" && (
          <button type="button" disabled={busy || resending} onClick={handleResend} className={`${styles.btn} ${styles.btnGhost}`}>
            {resending ? "Enviando…" : "📲 Enviar confirmação por WhatsApp"}
          </button>
        )}
        {status !== "confirmado" && status !== "em_atendimento" && !isTerminal && (
          <button type="button" disabled={busy} onClick={() => patch({ status: "confirmado" }, "Agendamento confirmado.")} className={`${styles.btn} ${styles.btnPrimary}`}>
            Confirmar
          </button>
        )}
        {status !== "em_atendimento" && !isTerminal && (
          <button
            type="button"
            disabled={busy}
            onClick={() => patch({ status: "em_atendimento" }, "Atendimento iniciado.")}
            className={`${styles.btn} ${styles.btnPrimary}`}
          >
            Iniciar atendimento
          </button>
        )}
        {status !== "atendido" && !isTerminal && (
          <button type="button" disabled={busy} onClick={() => patch({ status: "atendido" }, "Marcado como atendido.")} className={`${styles.btn} ${styles.btnGhost}`}>
            Marcar como atendido
          </button>
        )}
        {!isTerminal && (
          <button type="button" disabled={busy} onClick={() => patch({ status: "faltou" }, "Marcado como falta.")} className={`${styles.btn} ${styles.btnGhost}`}>
            Marcar falta
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
        {!isTerminal && (
          <button
            type="button"
            disabled={busy}
            onClick={() => patch({ urgent: !urgent }, urgent ? "Urgência removida." : "Marcado como urgência.")}
            className={`${styles.btn} ${styles.btnGhost}`}
          >
            {urgent ? "Remover urgência" : "Marcar como urgência"}
          </button>
        )}
      </div>

      {isTerminal && (
        <p style={{ color: "var(--ink-faint)", fontSize: 12.5, margin: "10px 0 0" }}>
          {status === "atendido"
            ? "Consulta já concluída — sem mais ações de status."
            : status === "faltou"
              ? "Paciente não compareceu — sem mais ações de status."
              : "Horário liberado — crie um novo agendamento pra realocá-lo."}
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
                min={brDateOnly()}
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
          <div className={styles.field}>
            <label htmlFor="rescheduleDuration" className={styles.label}>
              Duração
            </label>
            <select
              id="rescheduleDuration"
              className={styles.select}
              value={newDuration}
              onChange={(e) => setNewDuration(Number(e.target.value))}
            >
              {DURATION_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {d} minutos{d === 30 ? " (padrão)" : ""}
                </option>
              ))}
            </select>
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
