"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ToastStack, useToasts } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { AgentCertificateSelector, useAgent } from "@/components/AgentDetector";
import { signAnamnesisAsDentist } from "@/lib/anamnesisDentistSigningClient";
import styles from "@/styles/shell.module.css";

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

export function AnamnesisActions({
  clinicId,
  anamnesisId,
  hasPatientSignature,
  dentistSignatureStatus,
}: {
  clinicId: string;
  anamnesisId: string;
  hasPatientSignature: boolean;
  dentistSignatureStatus: "nao_assinada" | "assinada";
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [showAgentSelector, setShowAgentSelector] = useState(false);
  const [signing, setSigning] = useState(false);
  const { signHash } = useAgent();
  const { toasts, push, dismiss } = useToasts();
  const isLocalAgentMode = process.env.NEXT_PUBLIC_SIGNATURE_PROVIDER === "local_agent";

  async function handleDelete() {
    setDeleteConfirmOpen(false);
    setDeleting(true);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/anamneses/${anamnesisId}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        push(data?.message || data?.error || "Falha ao excluir a anamnese.");
        return;
      }
      push("Anamnese excluída.", "success");
      router.push("/dashboard/anamneses");
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  function handleSignAsDentist() {
    if (!isLocalAgentMode) {
      push("Este recurso exige o Agente de Assinatura Digital local — configure em Configurações.", "error");
      return;
    }
    if (!hasPatientSignature) {
      push("O paciente ainda não assinou esta anamnese.", "error");
      return;
    }
    setShowAgentSelector(true);
  }

  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      {dentistSignatureStatus === "assinada" ? (
        <span className={styles.iconActionBtn} style={{ color: "var(--brand-deep)", cursor: "default" }} title="Assinada pela dentista" aria-label="Assinada pela dentista">
          <SignIcon />
        </span>
      ) : (
        <button
          type="button"
          onClick={handleSignAsDentist}
          disabled={signing || !hasPatientSignature}
          className={styles.iconActionBtn}
          title={signing ? "Assinando…" : hasPatientSignature ? "Assinar como dentista" : "O paciente ainda não assinou esta anamnese"}
          aria-label="Assinar como dentista"
        >
          <SignIcon />
        </button>
      )}

      <button
        type="button"
        onClick={() => setDeleteConfirmOpen(true)}
        disabled={deleting}
        className={styles.iconActionBtn}
        title={deleting ? "Excluindo…" : "Excluir anamnese"}
        aria-label="Excluir anamnese"
      >
        <TrashIcon />
      </button>

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
            push("Anamnese assinada.", "success");
            router.refresh();
          } finally {
            setSigning(false);
          }
        }}
      />

      <ConfirmDialog
        open={deleteConfirmOpen}
        title="Excluir anamnese"
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
