"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PatientAvatar } from "@/components/PatientAvatar";
import { NewAppointmentTrigger } from "@/components/NewAppointmentTrigger";
import { AppointmentStatusBadge } from "@/components/AppointmentStatusBadge";
import { Pagination } from "@/components/ui/Pagination";
import { ToastStack, useToasts } from "@/components/ui/Toast";
import { formatBRDateTime } from "@/lib/date";
import type { Appointment } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

/**
 * Painel "Consultas canceladas" do dashboard — quem cancelou é quem tem mais
 * chance de sumir do radar da clínica sem querer. Ordenado do cancelamento
 * mais recente pro mais antigo (vem pronto do server component). Sai da
 * lista sozinho quando o paciente é reagendado de verdade (ver POST
 * /appointments); "excluir da lista" aqui é só um jeito manual de enxugar
 * sem esperar isso acontecer.
 */
export function CancelledAppointmentsPanel({
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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const { toasts, push, dismiss } = useToasts();

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === items.length ? new Set() : new Set(items.map((a) => a.id))));
  }

  async function handleSend(id: string) {
    setSendingId(id);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/appointments/${id}/cancellation-outreach`, { method: "POST" });
      if (!res.ok) {
        push("Falha ao enviar — confira se o WhatsApp da clínica está conectado.");
        return;
      }
      push("Mensagem enviada.", "success");
      setSentIds((prev) => new Set(prev).add(id));
    } finally {
      setSendingId(null);
    }
  }

  async function handleDismiss(id: string) {
    setDismissingId(id);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/appointments/${id}/dismiss-cancellation`, { method: "POST" });
      if (!res.ok) {
        push("Falha ao remover da lista.");
        return;
      }
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      router.refresh();
    } finally {
      setDismissingId(null);
    }
  }

  async function handleBulkDismiss() {
    if (selected.size === 0) return;
    setBulkBusy(true);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/appointments/dismiss-cancellations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selected) }),
      });
      if (!res.ok) {
        push("Falha ao excluir selecionados.");
        return;
      }
      push(`${selected.size} removido${selected.size === 1 ? "" : "s"} da lista.`, "success");
      setSelected(new Set());
      router.refresh();
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <p className={styles.panelHeaderTitle}>Consultas canceladas</p>
        {selected.size > 0 && (
          <button type="button" className={`${styles.btn} ${styles.btnDanger}`} disabled={bulkBusy} onClick={handleBulkDismiss}>
            {bulkBusy ? "Removendo…" : `Excluir ${selected.size} da lista`}
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <div className={styles.emptyState}>Nenhuma consulta cancelada pendente de contato.</div>
      ) : (
        <>
          <table className={styles.table}>
            <thead>
              <tr>
                <th style={{ width: 34 }}>
                  <input
                    type="checkbox"
                    checked={selected.size === items.length}
                    onChange={toggleAll}
                    aria-label="Selecionar todos"
                    style={{ width: 18, height: 18, accentColor: "var(--brand)" }}
                  />
                </th>
                <th>Paciente</th>
                <th>Consulta cancelada</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => {
                const sent = sentIds.has(a.id);
                return (
                  <tr key={a.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.has(a.id)}
                        onChange={() => toggle(a.id)}
                        aria-label={`Selecionar ${a.patient_name}`}
                        style={{ width: 18, height: 18, accentColor: "var(--brand)" }}
                      />
                    </td>
                    <td>
                      <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <PatientAvatar clinicId={clinicId} patientId={a.patient_id} name={a.patient_name} size={32} />
                        <span className={styles.rowTitle}>{a.patient_name}</span>
                      </span>
                    </td>
                    <td data-label="Consulta cancelada">{formatBRDateTime(a.scheduled_at, "medium")}</td>
                    <td data-label="Status">
                      <AppointmentStatusBadge status={a.status} />
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
          <Pagination
            page={page}
            totalPages={totalPages}
            count={count}
            itemLabel="cancelamento"
            hrefFor={hrefFor}
          />
        </>
      )}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
