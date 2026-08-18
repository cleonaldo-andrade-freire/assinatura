"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ToastStack, useToasts } from "@/components/ui/Toast";
import { RevokeDocumentButton } from "@/components/RevokeDocumentButton";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import type { PrescriptionStatus } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

export function PrescriptionActions({
  clinicId,
  prescriptionId,
  status,
  hasPhone,
  revoked,
  signUrl,
}: {
  clinicId: string;
  prescriptionId: string;
  status: PrescriptionStatus;
  hasPhone: boolean;
  revoked: boolean;
  signUrl?: string | null;
}) {
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);
  const [resending, setResending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const { toasts, push, dismiss } = useToasts();

  async function handleDelete() {
    setDeleteConfirmOpen(false);
    setDeleting(true);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/prescriptions/${prescriptionId}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        push(data?.message || data?.error || "Falha ao excluir a prescrição.");
        return;
      }
      push("Prescrição excluída.", "success");
      router.push("/dashboard/prescricoes");
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  async function handleCheckSignature() {
    setChecking(true);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/prescriptions/${prescriptionId}/check-signature`, {
        method: "POST",
      });
      if (!res.ok) {
        push("Falha ao verificar o status da assinatura.");
        return;
      }
      router.refresh();
    } finally {
      setChecking(false);
    }
  }


  async function handleRetry() {
    setRetrying(true);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/prescriptions/${prescriptionId}/issue`, { method: "POST" });
      if (!res.ok) {
        push("Falha ao tentar assinar novamente.");
        return;
      }
      router.refresh();
    } finally {
      setRetrying(false);
    }
  }

  async function handleResend() {
    setResending(true);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/prescriptions/${prescriptionId}/resend`, { method: "POST" });
      if (!res.ok) {
        push("Falha ao reenviar por WhatsApp.");
        return;
      }
      push("Link reenviado por WhatsApp.", "success");
      router.refresh();
    } finally {
      setResending(false);
    }
  }

  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      {status === "aguardando_assinatura" && signUrl && (
        <a href={signUrl} target="_blank" rel="noreferrer" className={`${styles.btn} ${styles.btnPrimary}`}>
          Assinar agora ↗
        </a>
      )}
      {status === "aguardando_assinatura" && (
        <button
          type="button"
          onClick={handleCheckSignature}
          disabled={checking}
          className={`${styles.btn} ${styles.btnGhost}`}
        >
          {checking ? "Verificando…" : "Verificar assinatura agora"}
        </button>
      )}
      {status === "falha" && (
        <button
          type="button"
          onClick={handleRetry}
          disabled={retrying}
          className={`${styles.btn} ${styles.btnPrimary}`}
        >
          {retrying ? "Tentando…" : "Tentar novamente"}
        </button>
      )}
      {status === "assinado" && hasPhone && (
        <button
          type="button"
          onClick={handleResend}
          disabled={resending}
          className={`${styles.btn} ${styles.btnGhost}`}
        >
          {resending ? "Enviando…" : "Reenviar por WhatsApp"}
        </button>
      )}
      {status === "assinado" && !revoked && (
        <RevokeDocumentButton revokeUrl={`/api/clinics/${clinicId}/prescriptions/${prescriptionId}/revoke`} />
      )}
      <button
        type="button"
        onClick={() => setDeleteConfirmOpen(true)}
        disabled={deleting}
        className={`${styles.btn} ${styles.btnGhost}`}
        style={{ color: "var(--danger)" }}
      >
        {deleting ? "Excluindo…" : "Excluir"}
      </button>

      <ConfirmModal
        open={deleteConfirmOpen}
        title="Excluir esta prescrição?"
        description="Remove o registro e o PDF definitivamente — essa ação não pode ser desfeita."
        confirmText="Sim, excluir"
        cancelText="Cancelar"
        danger={true}
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirmOpen(false)}
      />

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
