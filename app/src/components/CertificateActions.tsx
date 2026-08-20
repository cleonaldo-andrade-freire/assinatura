"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ToastStack, useToasts } from "@/components/ui/Toast";
import { RevokeDocumentButton } from "@/components/RevokeDocumentButton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { CertificateStatus } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

function SignIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 20l4.5-1 10-10a2.1 2.1 0 00-3-3l-10 10L4 20z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckSignatureIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 12a8 8 0 0113.66-5.66M20 12a8 8 0 01-13.66 5.66" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M17.5 3v4h-4M6.5 21v-4h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M21 11.5a8.5 8.5 0 01-12.36 7.56L3 21l2.02-5.4A8.5 8.5 0 1121 11.5z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
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
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {status === "aguardando_assinatura" && signUrl && (
        <a href={signUrl} target="_blank" rel="noreferrer" className={styles.iconActionBtn} title="Assinar agora" aria-label="Assinar agora">
          <SignIcon />
        </a>
      )}
      {status === "aguardando_assinatura" && (
        <button
          type="button"
          onClick={handleCheckSignature}
          disabled={checking}
          className={styles.iconActionBtn}
          title={checking ? "Verificando…" : "Verificar assinatura agora"}
          aria-label="Verificar assinatura agora"
        >
          <CheckSignatureIcon />
        </button>
      )}
      {status === "falha" && (
        <button
          type="button"
          onClick={handleRetry}
          disabled={retrying}
          className={styles.iconActionBtn}
          title={retrying ? "Tentando…" : "Tentar novamente"}
          aria-label="Tentar novamente"
        >
          <CheckSignatureIcon />
        </button>
      )}
      {status === "pendente_assinatura" && (
        <button
          type="button"
          onClick={handleRetry}
          disabled={retrying}
          className={styles.iconActionBtn}
          title={retrying ? "Assinando…" : "Assina digitalmente este mesmo registro agora, pelo computador — não cria um documento novo."}
          aria-label="Assinar digitalmente agora"
        >
          <SignIcon />
        </button>
      )}
      {status === "assinado" && hasPhone && (
        <button
          type="button"
          onClick={handleResend}
          disabled={resending}
          className={styles.iconActionBtn}
          title={resending ? "Enviando…" : "Reenviar por WhatsApp"}
          aria-label="Reenviar por WhatsApp"
        >
          <WhatsAppIcon />
        </button>
      )}
      {status === "assinado" && !revoked && (
        <RevokeDocumentButton revokeUrl={`/api/clinics/${clinicId}/certificates/${certificateId}/revoke`} />
      )}
      <button
        type="button"
        onClick={() => setDeleteConfirmOpen(true)}
        disabled={deleting}
        className={styles.iconActionBtn}
        title={deleting ? "Excluindo…" : "Excluir atestado"}
        aria-label="Excluir atestado"
      >
        <TrashIcon />
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
