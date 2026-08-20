"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ToastStack, useToasts } from "@/components/ui/Toast";
import type { CertificateStatus } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

function DownloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3v12m0 0l-4.5-4.5M12 15l4.5-4.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 18v1.5A1.5 1.5 0 005.5 21h13a1.5 1.5 0 001.5-1.5V18" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
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

/** Ícones de Baixar/Reenviar por WhatsApp na linha da lista de atestados —
 * mesmas rotas já usadas em CertificateActions.tsx (página de detalhe),
 * só que compactas pra caber no grid. */
export function CertificateGridActions({
  clinicId,
  certificateId,
  status,
  hasPhone,
}: {
  clinicId: string;
  certificateId: string;
  status: CertificateStatus;
  hasPhone: boolean;
}) {
  const router = useRouter();
  const [resending, setResending] = useState(false);
  const { toasts, push, dismiss } = useToasts();

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

  if (status !== "assinado" && status !== "pendente_assinatura") return null;

  return (
    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
      <a
        href={`/api/certificates/download/${certificateId}`}
        target="_blank"
        rel="noreferrer"
        className={styles.iconActionBtn}
        title="Baixar PDF"
        aria-label="Baixar PDF"
      >
        <DownloadIcon />
      </a>
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
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
