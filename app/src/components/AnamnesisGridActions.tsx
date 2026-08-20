"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ToastStack, useToasts } from "@/components/ui/Toast";

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

/** Ícones de Baixar/Reenviar por WhatsApp numa linha de anamnese já
 * assinada — usado no grid principal e na aba Anamneses da ficha do
 * paciente. `iconClassName` é passado de fora porque as duas telas usam
 * classes de ícone ligeiramente diferentes (shell.module.css). */
export function AnamnesisGridActions({
  clinicId,
  anamnesisId,
  signatureId,
  hasPhone,
  iconClassName,
}: {
  clinicId: string;
  anamnesisId: string;
  signatureId: string;
  hasPhone: boolean;
  iconClassName: string;
}) {
  const router = useRouter();
  const [resending, setResending] = useState(false);
  const { toasts, push, dismiss } = useToasts();

  async function handleResend() {
    setResending(true);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/anamneses/${anamnesisId}/resend`, { method: "POST" });
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
    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
      <a href={`/api/pdf/${signatureId}`} target="_blank" rel="noreferrer" className={iconClassName} title="Baixar PDF assinado" aria-label="Baixar PDF assinado">
        <DownloadIcon />
      </a>
      {hasPhone && (
        <button
          type="button"
          onClick={handleResend}
          disabled={resending}
          className={iconClassName}
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
