"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RescheduleAppointmentModal } from "@/components/RescheduleAppointmentModal";
import { ToastStack, useToasts } from "@/components/ui/Toast";
import type { AppointmentStatus } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

export function AppointmentActions({
  clinicId,
  appointmentId,
  patientId,
  status,
  urgent,
  scheduledAt,
  durationMinutes,
  onChanged,
}: {
  clinicId: string;
  appointmentId: string;
  /** Paciente vinculado — "Iniciar atendimento" leva pra aba Tratamentos da
   * ficha dele. Sem cadastro (só nome/telefone), não tem pra onde navegar. */
  patientId: string | null;
  status: AppointmentStatus;
  urgent: boolean;
  scheduledAt: string;
  durationMinutes: number;
  /** Além do router.refresh() (que só afeta Server Components ao redor), o
   * modal de detalhe aberto fora da agenda busca os dados por fetch — sem
   * isso, status/urgência ficavam desatualizados ali depois de uma ação. */
  onChanged?: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
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
      onChanged?.();
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm("Excluir este agendamento? Essa ação não pode ser desfeita.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/appointments/${appointmentId}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        push(data?.message || data?.error || "Falha ao excluir o agendamento.");
        return;
      }
      push("Agendamento excluído.", "success");
      router.push("/dashboard/agenda");
      router.refresh();
      onChanged?.();
    } finally {
      setBusy(false);
    }
  }

  async function handleReschedule(newTime: string, newDuration: number) {
    const ok = await patch({ scheduled_at: newTime, duration_minutes: newDuration }, "Agendamento remarcado.");
    if (ok) setRescheduling(false);
  }

  async function handleStartAttendance() {
    const ok = await patch({ status: "em_atendimento" }, "Atendimento iniciado.");
    // Leva direto pra aba de Tratamentos da ficha — é lá que o registro do
    // atendimento (evolução, finalização) acontece. Sem paciente cadastrado
    // não tem ficha pra abrir, só atualiza o status mesmo.
    if (ok && patientId) router.push(`/dashboard/pacientes/${patientId}?tab=tratamentos`);
  }

  const isTerminal = status === "atendido" || status === "cancelado_paciente" || status === "cancelado_dentista" || status === "faltou";

  return (
    <>
      {!isTerminal && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button
            type="button"
            disabled={busy}
            onClick={() => patch({ urgent: !urgent }, urgent ? "Urgência removida." : "Marcado como urgência.")}
            className={styles.iconActionBtn}
            title={urgent ? "Remover urgência" : "Marcar como urgência"}
            aria-label={urgent ? "Remover urgência" : "Marcar como urgência"}
            aria-pressed={urgent}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 3L22 20H2L12 3z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
              <path d="M12 10v4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
              <circle cx="12" cy="17" r="1" fill="currentColor" />
            </svg>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setRescheduling(true)}
            className={styles.iconActionBtn}
            title="Remarcar"
            aria-label="Remarcar agendamento"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="3.5" y="5" width="17" height="15" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
              <path d="M3.5 9.5h17M8 3v3.5M16 3v3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => patch({ status: "faltou" }, "Marcado como falta.")}
            className={styles.iconActionBtn}
            title="Marcar falta"
            aria-label="Marcar falta"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="9.5" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.7" />
              <path d="M3.5 19c.8-3.3 3-5 6-5M15 9l5 5M20 9l-5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </button>
          {/* "atendido" já está entre os status terminais (isTerminal), então
             chegar aqui garante que ainda não foi marcado como atendido. */}
          <button
            type="button"
            disabled={busy}
            onClick={() => patch({ status: "atendido" }, "Marcado como atendido.")}
            className={styles.iconActionBtn}
            title="Marcar como atendido"
            aria-label="Marcar como atendido"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
              <path d="M8 12.5l2.5 2.5L16 9.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {status === "agendado" && (
            <button
              type="button"
              disabled={resending}
              onClick={handleResend}
              className={styles.iconActionBtn}
              title={resending ? "Enviando…" : "Enviar confirmação por WhatsApp"}
              aria-label="Enviar confirmação por WhatsApp"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M21 11.5a8.5 8.5 0 01-12.36 7.56L3 21l2.02-5.4A8.5 8.5 0 1121 11.5z"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
          {status !== "em_atendimento" && (
            <button
              type="button"
              disabled={busy}
              onClick={handleStartAttendance}
              className={styles.iconActionBtn}
              title="Iniciar atendimento"
              aria-label="Iniciar atendimento"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M8 5v14l11-7z" />
              </svg>
            </button>
          )}
          {status !== "confirmado" && status !== "em_atendimento" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => patch({ status: "confirmado" }, "Agendamento confirmado.")}
              className={styles.iconActionBtn}
              title="Confirmar"
              aria-label="Confirmar agendamento"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => patch({ status: "cancelado_dentista" }, "Agendamento cancelado — horário liberado.")}
            className={styles.iconActionBtn}
            title="Cancelar"
            aria-label="Cancelar agendamento"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
              <path d="M9 9l6 6M15 9l-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      )}

      {/* Exclusão definitiva (hard delete) — temporário, só pra facilitar
         limpeza de agendamentos de teste; diferente de "Cancelar", que só
         muda o status. */}
      <div style={{ display: "flex", marginTop: isTerminal ? 0 : 8 }}>
        <button
          type="button"
          disabled={busy}
          onClick={handleDelete}
          className={styles.iconActionBtn}
          title="Excluir agendamento"
          aria-label="Excluir agendamento"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m2 0v13a1 1 0 01-1 1H8a1 1 0 01-1-1V7h10z"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <RescheduleAppointmentModal
        open={rescheduling}
        onClose={() => setRescheduling(false)}
        scheduledAt={scheduledAt}
        durationMinutes={durationMinutes}
        saving={busy}
        onConfirm={handleReschedule}
      />

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </>
  );
}
