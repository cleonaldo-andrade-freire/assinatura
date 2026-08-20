"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ToastStack, useToasts } from "@/components/ui/Toast";
import type { BudgetStatus } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

function PdfIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 3h9l5 5v13a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M14 3v5h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M21 11.5a8.5 8.5 0 01-12.36 7.56L3 21l2.02-5.4A8.5 8.5 0 1121 11.5z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ApproveIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GenerateIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 12a8 8 0 0113.66-5.66M20 12a8 8 0 01-13.66 5.66"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path d="M17.5 3v4h-4M6.5 21v-4h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

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
    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
      {hasPdf && (
        <a
          href={`/api/clinics/${clinicId}/budgets/${budgetId}/pdf`}
          target="_blank"
          rel="noreferrer"
          className={styles.iconActionBtn}
          title="Ver PDF"
          aria-label="Ver PDF"
        >
          <PdfIcon />
        </a>
      )}
      <button
        type="button"
        disabled={sending}
        onClick={handleSend}
        className={styles.iconActionBtn}
        title={sending ? "Enviando…" : "Enviar por WhatsApp"}
        aria-label="Enviar por WhatsApp"
      >
        <WhatsAppIcon />
      </button>
      {status !== "aprovado" ? (
        <button
          type="button"
          disabled={approving}
          onClick={handleApprove}
          className={styles.iconActionBtn}
          title={approving ? "Aprovando…" : "Aprovar"}
          aria-label="Aprovar orçamento"
        >
          <ApproveIcon />
        </button>
      ) : (
        <button
          type="button"
          disabled={generating}
          onClick={handleGenerateTreatments}
          className={styles.iconActionBtn}
          title={generating ? "Gerando…" : "Recria os tratamentos deste orçamento na ficha do paciente, caso não tenham sido gerados"}
          aria-label="Gerar tratamentos"
        >
          <GenerateIcon />
        </button>
      )}
      <button
        type="button"
        onClick={() => setConfirmDeleteOpen(true)}
        className={styles.iconActionBtn}
        title="Excluir orçamento"
        aria-label="Excluir orçamento"
      >
        <TrashIcon />
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
