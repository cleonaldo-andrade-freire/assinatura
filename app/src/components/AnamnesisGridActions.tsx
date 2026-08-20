"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ToastStack, useToasts } from "@/components/ui/Toast";
import { AgentCertificateSelector, useAgent } from "@/components/AgentDetector";
import { signAnamnesisAsDentist } from "@/lib/anamnesisDentistSigningClient";

export function LinkIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

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

function SignIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 20h9" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path
        d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
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
  dentistSignatureStatus,
  iconClassName,
}: {
  clinicId: string;
  anamnesisId: string;
  signatureId: string;
  hasPhone: boolean;
  dentistSignatureStatus: "nao_assinada" | "assinada";
  iconClassName: string;
}) {
  const router = useRouter();
  const [resending, setResending] = useState(false);
  const [signing, setSigning] = useState(false);
  const [showAgentSelector, setShowAgentSelector] = useState(false);
  const { signHash } = useAgent();
  const { toasts, push, dismiss } = useToasts();
  const isLocalAgentMode = process.env.NEXT_PUBLIC_SIGNATURE_PROVIDER === "local_agent";

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
      {isLocalAgentMode &&
        (dentistSignatureStatus === "assinada" ? (
          <span className={iconClassName} style={{ color: "var(--brand-deep)", cursor: "default" }} title="Assinada pela dentista" aria-label="Assinada pela dentista">
            <SignIcon />
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setShowAgentSelector(true)}
            disabled={signing}
            className={iconClassName}
            title={signing ? "Assinando…" : "Assinar como dentista"}
            aria-label="Assinar como dentista"
          >
            <SignIcon />
          </button>
        ))}
      <AgentCertificateSelector
        open={showAgentSelector}
        onOpenChange={setShowAgentSelector}
        onCertificateSelected={async (cert) => {
          setShowAgentSelector(false);
          setSigning(true);
          try {
            const result = await signAnamnesisAsDentist(clinicId, anamnesisId, cert, signHash);
            if (!result.ok) {
              push(result.error, "error");
              return;
            }
            push("Anamnese assinada pela dentista.", "success");
            router.refresh();
          } finally {
            setSigning(false);
          }
        }}
      />
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
