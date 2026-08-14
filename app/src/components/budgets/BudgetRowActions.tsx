"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
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
  const [generating, setGenerating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
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

  async function handleGenerateTreatments() {
    setGenerating(true);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/budgets/${budgetId}/generate-treatments`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        push("Falha ao gerar tratamentos. Tenta de novo.");
        return;
      }
      push(data.created > 0 ? `${data.created} tratamento${data.created === 1 ? "" : "s"} gerado${data.created === 1 ? "" : "s"}.` : "Os tratamentos deste orçamento já existiam.", "success");
      router.refresh();
    } finally {
      setGenerating(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/budgets/${budgetId}`, { method: "DELETE" });
      if (!res.ok) {
        push("Falha ao excluir. Tenta de novo.");
        return;
      }
      setConfirmDeleteOpen(false);
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
      {hasPdf && (
        <a
          href={`/api/clinics/${clinicId}/budgets/${budgetId}/pdf`}
          target="_blank"
          rel="noreferrer"
          className={`${styles.btn} ${styles.btnGhost}`}
        >
          Ver PDF
        </a>
      )}
      <button type="button" disabled={sending} onClick={handleSend} className={`${styles.btn} ${styles.btnGhost}`}>
        {sending ? "Enviando…" : "📲 WhatsApp"}
      </button>
      {status !== "aprovado" ? (
        <button type="button" disabled={approving} onClick={handleApprove} className={`${styles.btn} ${styles.btnGhost}`}>
          {approving ? "Aprovando…" : "Aprovar"}
        </button>
      ) : (
        <button
          type="button"
          disabled={generating}
          onClick={handleGenerateTreatments}
          className={`${styles.btn} ${styles.btnGhost}`}
          title="Recria os tratamentos deste orçamento na ficha do paciente, caso não tenham sido gerados"
        >
          {generating ? "Gerando…" : "Gerar tratamentos"}
        </button>
      )}
      <button
        type="button"
        onClick={() => setConfirmDeleteOpen(true)}
        className={`${styles.btn} ${styles.btnGhost}`}
        style={{ color: "var(--danger)" }}
      >
        Excluir
      </button>

      <ConfirmDialog
        open={confirmDeleteOpen}
        title="Excluir orçamento"
        message="Isso remove o orçamento e o PDF gerado. Tratamentos já criados a partir dele (se aprovado) não são afetados."
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        danger
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDeleteOpen(false)}
      />
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
