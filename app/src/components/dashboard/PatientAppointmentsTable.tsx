"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppointmentDetailModal } from "@/components/dashboard/AppointmentDetailModal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ToastStack, useToasts } from "@/components/ui/Toast";
import { APPOINTMENT_STATUS_CLASS, APPOINTMENT_STATUS_LABEL } from "@/lib/appointments";
import { formatBRDateTime } from "@/lib/date";
import type { Appointment } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m2 0v13a1 1 0 01-1 1H8a1 1 0 01-1-1V7h10z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

/** Aba "Agendamentos" da ficha do paciente — linha inteira abre o mesmo
 * detalhe/edição de sempre (AppointmentDetailModal, com todas as ações —
 * remarcar, confirmar, marcar falta/atendido, etc. — já em ícone ali
 * dentro), e um ícone de excluir direto na linha evita precisar abrir o
 * modal só pra apagar um agendamento de teste. */
export function PatientAppointmentsTable({ clinicId, appointments }: { clinicId: string; appointments: Appointment[] }) {
  const router = useRouter();
  const [detailId, setDetailId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { toasts, push, dismiss } = useToasts();

  async function handleDelete() {
    if (!confirmDeleteId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/appointments/${confirmDeleteId}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        push(data?.message || data?.error || "Falha ao excluir o agendamento.");
        return;
      }
      setConfirmDeleteId(null);
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Data e horário</th>
            <th>Profissional</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {appointments.map((a) => (
            <tr key={a.id} className="clickableRow" onClick={() => setDetailId(a.id)}>
              <td>{formatBRDateTime(a.scheduled_at, "medium")}</td>
              <td>{a.professional_name}</td>
              <td>
                <span className={`${styles.statusDot} ${styles[APPOINTMENT_STATUS_CLASS[a.status]]}`}>
                  {APPOINTMENT_STATUS_LABEL[a.status]}
                </span>
              </td>
              <td onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteId(a.id)}
                  className={styles.iconActionBtn}
                  title="Excluir agendamento"
                  aria-label="Excluir agendamento"
                >
                  <TrashIcon />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <AppointmentDetailModal open={detailId !== null} onClose={() => setDetailId(null)} clinicId={clinicId} appointmentId={detailId} />

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Excluir agendamento"
        message="Essa ação não pode ser desfeita."
        confirmLabel="Sim, excluir"
        cancelLabel="Cancelar"
        danger
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDeleteId(null)}
      />
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </>
  );
}
