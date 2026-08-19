"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ToastStack, useToasts } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import styles from "@/styles/shell.module.css";

export function AnamnesisActions({ clinicId, anamnesisId }: { clinicId: string; anamnesisId: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const { toasts, push, dismiss } = useToasts();

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

  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
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
