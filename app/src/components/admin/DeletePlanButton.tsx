"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ToastStack, useToasts } from "@/components/ui/Toast";
import styles from "@/components/admin/admin.module.css";

export function DeletePlanButton({ planId, planName }: { planId: string; planName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toasts, push, dismiss } = useToasts();

  async function handleDelete() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/plans/${planId}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        push(data?.message || "Falha ao excluir. Tenta desativar em vez de excluir.");
        return;
      }
      setOpen(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`${styles.btn} ${styles.btnGhost}`} style={{ padding: "6px 10px", fontSize: 12.5 }}>
        Excluir
      </button>
      <ConfirmDialog
        open={open}
        title={`Excluir plano ${planName}`}
        message="Só funciona se nenhuma clínica estiver usando esse plano. Se alguma estiver, desative em vez de excluir."
        confirmLabel="Excluir"
        cancelLabel="Voltar"
        danger
        loading={loading}
        onConfirm={handleDelete}
        onCancel={() => setOpen(false)}
      />
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </>
  );
}
