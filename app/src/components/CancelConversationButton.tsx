"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ToastStack, useToasts } from "@/components/ui/Toast";
import styles from "@/styles/shell.module.css";

export function CancelConversationButton({ clinicId, conversationId }: { clinicId: string; conversationId: string }) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toasts, push, dismiss } = useToasts();

  async function handleCancel() {
    setLoading(true);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/conversations/${conversationId}`, { method: "PATCH" });
      if (!res.ok) {
        push("Falha ao cancelar a anamnese. Tenta de novo.");
        return;
      }
      setConfirmOpen(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        className={`${styles.btn} ${styles.btnGhost}`}
        style={{ padding: "6px 12px", fontSize: 13 }}
      >
        Cancelar
      </button>

      <ConfirmDialog
        open={confirmOpen}
        title="Cancelar anamnese em andamento"
        message="O paciente para de receber as próximas perguntas dessa anamnese. O histórico até aqui fica salvo, e você pode iniciar uma nova a qualquer momento."
        confirmLabel="Cancelar anamnese"
        cancelLabel="Voltar"
        danger
        loading={loading}
        onConfirm={handleCancel}
        onCancel={() => setConfirmOpen(false)}
      />
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </>
  );
}
