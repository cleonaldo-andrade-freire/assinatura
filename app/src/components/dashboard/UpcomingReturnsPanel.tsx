"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PatientAvatar } from "@/components/PatientAvatar";
import { NewAppointmentTrigger } from "@/components/NewAppointmentTrigger";
import { Pagination } from "@/components/ui/Pagination";
import { ToastStack, useToasts } from "@/components/ui/Toast";
import { formatBRDate, formatBRDateTime } from "@/lib/date";
import type { Appointment } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

function daysFromToday(dateStr: string): number {
  const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00-03:00`);
  const target = new Date(`${dateStr}T00:00:00-03:00`);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function dueLabel(dateStr: string): string {
  const diff = daysFromToday(dateStr);
  if (diff < 0) return `atrasado há ${Math.abs(diff)}d`;
  if (diff === 0) return "hoje";
  if (diff === 1) return "amanhã";
  return `em ${diff}d`;
}

/**
 * Painel "Retornos próximos" do dashboard — ordenado do retorno mais
 * próximo pro mais antigo (vem pronto do server component). Sai da lista
 * sozinho quando o paciente é reagendado de verdade (ver POST
 * /appointments); "excluir da lista" aqui é só um jeito manual de tirar do
 * radar sem esperar isso acontecer.
 */
export function UpcomingReturnsPanel({
  clinicId,
  professionalName,
  todayDate,
  items,
  page,
  totalPages,
  count,
  hrefFor,
}: {
  clinicId: string;
  professionalName: string;
  todayDate: string;
  items: Appointment[];
  page: number;
  totalPages: number;
  count: number;
  hrefFor: (page: number) => string;
}) {
  const router = useRouter();
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const { toasts, push, dismiss } = useToasts();

  async function handleSend(id: string) {
    setSendingId(id);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/appointments/${id}/return-reminder`, { method: "POST" });
      if (!res.ok) {
        push("Falha ao enviar — confira se o WhatsApp da clínica está conectado.");
        return;
      }
      push("Lembrete de retorno enviado.", "success");
      setSentIds((prev) => new Set(prev).add(id));
    } finally {
      setSendingId(null);
    }
  }

  async function handleDismiss(id: string) {
    setDismissingId(id);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/appointments/${id}/dismiss-return`, { method: "POST" });
      if (!res.ok) {
        push("Falha ao remover da lista.");
        return;
      }
      router.refresh();
    } finally {
      setDismissingId(null);
    }
  }

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <p className={styles.panelHeaderTitle}>Retornos próximos</p>
      </div>
      {items.length === 0 ? (
        <div className={styles.emptyState}>Nenhum retorno pendente no momento.</div>
      ) : (
        <>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Paciente</th>
                <th>Último agendamento</th>
                <th>Data de retorno</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => {
                const sent = sentIds.has(a.id);
                return (
                  <tr key={a.id}>
                    <td>
                      <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <PatientAvatar clinicId={clinicId} patientId={a.patient_id} name={a.patient_name} size={32} />
                        <span className={styles.rowTitle}>{a.patient_name}</span>
                      </span>
                    </td>
                    <td data-label="Último agendamento">{formatBRDateTime(a.scheduled_at, "medium")}</td>
                    <td data-label="Data de retorno">
                      {formatBRDate(`${a.return_due_date}T12:00:00-03:00`)}{" "}
                      <span style={{ color: "var(--ink-faint)", fontSize: 12 }}>({dueLabel(a.return_due_date!)})</span>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                        <button
                          type="button"
                          disabled={sendingId === a.id || sent}
                          onClick={() => handleSend(a.id)}
                          className={`${styles.btn} ${styles.btnGhost}`}
                        >
                          {sent ? "Enviado ✓" : sendingId === a.id ? "Enviando…" : "📲 WhatsApp"}
                        </button>
                        <NewAppointmentTrigger
                          clinicId={clinicId}
                          professionalName={professionalName}
                          date={todayDate}
                          patientId={a.patient_id}
                          patientName={a.patient_name}
                          patientPhone={a.patient_phone}
                          className={`${styles.btn} ${styles.btnGhost}`}
                        >
                          📅 Agendar
                        </NewAppointmentTrigger>
                        <button
                          type="button"
                          disabled={dismissingId === a.id}
                          onClick={() => handleDismiss(a.id)}
                          className={`${styles.btn} ${styles.btnGhost}`}
                          title="Tirar da lista (não apaga o cadastro)"
                        >
                          {dismissingId === a.id ? "Removendo…" : "🗑 Excluir da lista"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Pagination page={page} totalPages={totalPages} count={count} itemLabel="retorno" hrefFor={hrefFor} />
        </>
      )}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
