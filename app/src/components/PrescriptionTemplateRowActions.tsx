"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ToastStack, useToasts } from "@/components/ui/Toast";
import styles from "@/styles/shell.module.css";

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-8 0v12a1 1 0 001 1h6a1 1 0 001-1V7"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PrescriptionTemplateRowActions({ clinicId, templateId }: { clinicId: string; templateId: string }) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { toasts, push, dismiss } = useToasts();

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/prescription-templates/${templateId}`, { method: "DELETE" });
      if (!res.ok) {
        push("Falha ao excluir. Tenta de novo.");
        return;
      }
      setConfirmOpen(false);
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }} onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          aria-label="Excluir modelo"
          title="Excluir"
          className={`${styles.btn} ${styles.btnGhost}`}
          style={{ padding: 7, color: "var(--danger)" }}
        >
          <TrashIcon />
        </button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Excluir modelo de receituário"
        message="Isso remove o modelo. Receituários já emitidos com ele não são afetados."
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        danger
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
      />
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </>
  );
}
