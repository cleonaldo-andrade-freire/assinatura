"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ToastStack, useToasts } from "@/components/ui/Toast";
import type { ConversationStatus } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

export function ConversationRowActions({
  clinicId,
  conversationId,
  status,
}: {
  clinicId: string;
  conversationId: string;
  status: ConversationStatus;
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const { toasts, push, dismiss } = useToasts();

  async function handleCancel() {
    setCancelLoading(true);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/conversations/${conversationId}`, { method: "PATCH" });
      if (!res.ok) {
        push("Falha ao cancelar. Tenta de novo.");
        return;
      }
      setConfirmOpen(false);
      router.refresh();
    } finally {
      setCancelLoading(false);
    }
  }

  async function handleResend() {
    setResendLoading(true);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/conversations/${conversationId}/resend`, { method: "POST" });
      if (!res.ok) {
        push("Falha ao reenviar a pergunta. Tenta de novo.");
        return;
      }
      push(status === "abandoned" ? "Anamnese retomada — pergunta reenviada." : "Pergunta reenviada.", "success");
      router.refresh();
    } finally {
      setResendLoading(false);
    }
  }

  return (
    <>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={handleResend}
          disabled={resendLoading}
          className={`${styles.btn} ${styles.btnGhost}`}
          style={{ padding: "6px 12px", fontSize: 13 }}
        >
          {resendLoading ? "Enviando…" : status === "abandoned" ? "Retomar" : "Reenviar pergunta"}
        </button>
        {status === "active" && (
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            className={`${styles.btn} ${styles.btnGhost}`}
            style={{ padding: "6px 12px", fontSize: 13 }}
          >
            Cancelar
          </button>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Cancelar anamnese em andamento"
        message="O paciente para de receber as próximas perguntas dessa anamnese. O histórico até aqui fica salvo, e dá pra retomar depois."
        confirmLabel="Cancelar anamnese"
        cancelLabel="Voltar"
        danger
        loading={cancelLoading}
        onConfirm={handleCancel}
        onCancel={() => setConfirmOpen(false)}
      />
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </>
  );
}
