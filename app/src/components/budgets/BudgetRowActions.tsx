"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ToastStack, useToasts } from "@/components/ui/Toast";
import type { BudgetStatus } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

export function BudgetRowActions({
  clinicId,
  budgetId,
  status,
  hasPdf,
}: {
  clinicId: string;
  budgetId: string;
  status: BudgetStatus;
  hasPdf: boolean;
}) {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [approving, setApproving] = useState(false);
  const { toasts, push, dismiss } = useToasts();

  async function handleSend() {
    setSending(true);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/budgets/${budgetId}/send-whatsapp`, { method: "POST" });
      if (!res.ok) {
        push("Falha ao enviar — confira se o WhatsApp da clínica está conectado.");
        return;
      }
      push("Orçamento enviado por WhatsApp.", "success");
      router.refresh();
    } finally {
      setSending(false);
    }
  }

  async function handleApprove() {
    setApproving(true);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/budgets/${budgetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "aprovado" }),
      });
      if (!res.ok) {
        push("Falha ao aprovar. Tenta de novo.");
        return;
      }
      push("Orçamento aprovado.", "success");
      router.refresh();
    } finally {
      setApproving(false);
    }
  }

  return (
    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
      {hasPdf && (
        <a href={`/api/clinics/${clinicId}/budgets/${budgetId}/pdf`} target="_blank" rel="noreferrer">
          Ver PDF
        </a>
      )}
      <button type="button" disabled={sending} onClick={handleSend} className={`${styles.btn} ${styles.btnGhost}`}>
        {sending ? "Enviando…" : "📲 WhatsApp"}
      </button>
      {status !== "aprovado" && (
        <button type="button" disabled={approving} onClick={handleApprove} className={`${styles.btn} ${styles.btnGhost}`}>
          {approving ? "Aprovando…" : "Aprovar"}
        </button>
      )}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
