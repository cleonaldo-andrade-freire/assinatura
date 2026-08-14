"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ToastStack, useToasts } from "@/components/ui/Toast";
import { PROSTHESIS_STAGES, PROSTHESIS_STAGE_LABEL } from "@/lib/prosthesisTemplates";
import type { ProsthesisStage } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

/** Alternativa aos botões pra quem não quer/não pode arrastar o card no board
 * (teclado, celular) — mesmo PATCH que o drag-and-drop usa. */
export function ProsthesisOrderActions({
  clinicId,
  orderId,
  stage,
}: {
  clinicId: string;
  orderId: string;
  stage: ProsthesisStage;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { toasts, push, dismiss } = useToasts();

  async function moveTo(next: ProsthesisStage) {
    setBusy(true);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/prosthesis-orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: next }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        push(data?.message || data?.error || "Falha ao mover o serviço.");
        return;
      }
      push(`Movido pra ${PROSTHESIS_STAGE_LABEL[next]}.`, "success");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/prosthesis-orders/${orderId}`, { method: "DELETE" });
      if (!res.ok) {
        push("Falha ao excluir. Tenta de novo.");
        return;
      }
      router.push("/dashboard/proteses");
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {PROSTHESIS_STAGES.filter((s) => s !== stage).map((s) => (
          <button
            key={s}
            type="button"
            disabled={busy}
            onClick={() => moveTo(s)}
            className={`${styles.btn} ${styles.btnGhost}`}
          >
            Mover pra {PROSTHESIS_STAGE_LABEL[s]}
          </button>
        ))}
      </div>
      <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
        <button
          type="button"
          disabled={busy}
          onClick={() => setConfirmDeleteOpen(true)}
          className={`${styles.btn} ${styles.btnGhost}`}
          style={{ color: "var(--danger)" }}
        >
          Excluir serviço
        </button>
      </div>
      <ConfirmDialog
        open={confirmDeleteOpen}
        title="Excluir serviço de prótese"
        message="Isso remove o serviço e todo o histórico de estágios dele. Não é possível desfazer."
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        danger
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDeleteOpen(false)}
      />
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
