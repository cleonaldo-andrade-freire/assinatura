"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import styles from "./ui.module.css";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** Sobrescreve o z-index padrão do overlay (200) — necessário quando o
   * diálogo pode ser aberto por cima de outro modal já aberto (ex.: excluir
   * um lead de dentro do modal de conversa), senão o overlay padrão fica
   * atrás do z-index do modal pai. Mesmo padrão de TreatmentFormModal. */
  zIndex?: number;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  danger,
  loading,
  onConfirm,
  onCancel,
  zIndex,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className={styles.overlay} style={zIndex ? { zIndex } : undefined} onClick={onCancel}>
      <div className={styles.dialog} role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h3 className={styles.dialogTitle}>{title}</h3>
        <p className={styles.dialogMessage}>{message}</p>
        <div className={styles.dialogActions}>
          <button type="button" className={styles.dialogBtnGhost} onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={danger ? styles.dialogBtnDanger : styles.dialogBtnPrimary}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "Aguarde…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
