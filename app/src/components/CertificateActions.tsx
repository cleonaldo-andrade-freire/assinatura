"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ToastStack, useToasts } from "@/components/ui/Toast";
import { RevokeDocumentButton } from "@/components/RevokeDocumentButton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { CertificateStatus } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

export function CertificateActions({
  clinicId,
  certificateId,
  status,
  hasPhone,
  revoked,
  signUrl,
}: {
  clinicId: string;
  certificateId: string;
  status: CertificateStatus;
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
      const res = await fetch(`/api/clinics/${clinicId}/certificates/${certificateId}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        push(data?.message || data?.error || "Falha ao excluir o atestado.");
        return;
      }
      push("Atestado excluído.", "success");
      router.push("/dashboard/atestados");
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  async function handleCheckSignature() {
    setChecking(true);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/certificates/${certificateId}/check-signature`, {
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
      const res = await fetch(`/api/clinics/${clinicId}/certificates/${certificateId}/issue`, { method: "POST" });
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
      const res = await fetch(`/api/clinics/${clinicId}/certificates/${certificateId}/resend`, { method: "POST" });
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
        <RevokeDocumentButton revokeUrl={`/api/clinics/${clinicId}/certificates/${certificateId}/revoke`} />
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

      <ConfirmDialog
        open={deleteConfirmOpen}
        title="Excluir atestado"
        message="Remove o registro e o PDF definitivamente — essa ação não pode ser desfeita."
        confirmLabel="Sim, excluir"
        cancelLabel="Cancelar"
        danger
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirmOpen(false)}
      />

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
