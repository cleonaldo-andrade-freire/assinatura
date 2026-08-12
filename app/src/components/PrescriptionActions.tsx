"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ToastStack, useToasts } from "@/components/ui/Toast";
import { RevokeDocumentButton } from "@/components/RevokeDocumentButton";
import type { PrescriptionStatus } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

export function PrescriptionActions({
  clinicId,
  prescriptionId,
  status,
  hasPhone,
  revoked,
}: {
  clinicId: string;
  prescriptionId: string;
  status: PrescriptionStatus;
  hasPhone: boolean;
  revoked: boolean;
}) {
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);
  const [resending, setResending] = useState(false);
  const { toasts, push, dismiss } = useToasts();

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
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
