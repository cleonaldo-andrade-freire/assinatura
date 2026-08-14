"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ActionMenu } from "@/components/ui/ActionMenu";
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

  // Só a ação mais relevante pro status atual fica em destaque — o resto
  // (mais raro/secundário) vai pro menu "⋯", inclusive Cancelar (em
  // vermelho, mas sem competir visualmente com as ações do dia a dia).
  const menuItems: { label: string; onClick: () => void; danger?: boolean; disabled?: boolean }[] = [];
  if (status === "agendado") {
    menuItems.push({ label: resending ? "Enviando…" : "📲 Enviar confirmação por WhatsApp", onClick: handleResend, disabled: resending });
  }
  if (!isTerminal) {
    // "atendido" já está entre os status terminais (isTerminal), então
    // chegar aqui garante que ainda não foi marcado como atendido.
    menuItems.push({ label: "Marcar como atendido", onClick: () => patch({ status: "atendido" }, "Marcado como atendido.") });
    menuItems.push({ label: "Marcar falta", onClick: () => patch({ status: "faltou" }, "Marcado como falta.") });
    menuItems.push({ label: "Remarcar", onClick: () => setRescheduling(true) });
    menuItems.push({
      label: urgent ? "Remover urgência" : "Marcar como urgência",
      onClick: () => patch({ urgent: !urgent }, urgent ? "Urgência removida." : "Marcado como urgência."),
    });
    menuItems.push({
      label: "Cancelar",
      danger: true,
      onClick: () => patch({ status: "cancelado_dentista" }, "Agendamento cancelado — horário liberado."),
    });
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        {status !== "confirmado" && status !== "em_atendimento" && !isTerminal && (
          <button type="button" disabled={busy} onClick={() => patch({ status: "confirmado" }, "Agendamento confirmado.")} className={`${styles.btn} ${styles.btnPrimary}`}>
            Confirmar
          </button>
        )}
        {status !== "em_atendimento" && !isTerminal && (
          <button type="button" disabled={busy} onClick={handleStartAttendance} className={`${styles.btn} ${styles.btnPrimary}`}>
            Iniciar atendimento
          </button>
        )}
        <ActionMenu items={menuItems} disabled={busy} />
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

      <RescheduleAppointmentModal
        open={rescheduling}
        onClose={() => setRescheduling(false)}
        scheduledAt={scheduledAt}
        durationMinutes={durationMinutes}
        saving={busy}
        onConfirm={handleReschedule}
      />

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
