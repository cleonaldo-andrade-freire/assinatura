"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ToastStack, useToasts } from "@/components/ui/Toast";
import { PatientAvatar } from "@/components/PatientAvatar";
import { formatBRDate } from "@/lib/date";
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

export function UpcomingReturns({ clinicId, returns }: { clinicId: string; returns: Appointment[] }) {
  const router = useRouter();
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const { toasts, push, dismiss } = useToasts();

  if (returns.length === 0) return null;

  async function handleSend(appointmentId: string) {
    setSendingId(appointmentId);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/appointments/${appointmentId}/return-reminder`, { method: "POST" });
      if (!res.ok) {
        push("Falha ao enviar — confira se o WhatsApp da clínica está conectado.");
        return;
      }
      push("Lembrete de retorno enviado.", "success");
      setSentIds((prev) => new Set(prev).add(appointmentId));
      router.refresh();
    } finally {
      setSendingId(null);
    }
  }

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <p className={styles.panelHeaderTitle}>Retornos próximos</p>
        <span style={{ fontSize: 12, color: "var(--ink-faint)" }}>próximos 14 dias</span>
      </div>
      <div className={styles.panelBody} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {returns.map((a) => {
          const sent = sentIds.has(a.id);
          return (
            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <PatientAvatar clinicId={clinicId} patientId={a.patient_id} name={a.patient_name} size={34} />
              <div style={{ flex: 1, minWidth: 160 }}>
                <Link href={`/dashboard/agenda/${a.id}`} style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink)" }}>
                  {a.patient_name}
                </Link>
                <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                  Retorno previsto {formatBRDate(`${a.return_due_date}T12:00:00-03:00`)} — {dueLabel(a.return_due_date!)}
                </div>
              </div>
              <button
                type="button"
                disabled={sendingId === a.id || sent}
                onClick={() => handleSend(a.id)}
                className={`${styles.btn} ${styles.btnGhost}`}
              >
                {sent ? "Lembrete enviado ✓" : sendingId === a.id ? "Enviando…" : "📲 Enviar lembrete"}
              </button>
            </div>
          );
        })}
      </div>
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
