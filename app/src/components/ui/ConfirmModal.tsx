"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import styles from "@/components/ui/ui.module.css";

export function ConfirmModal({
  open,
  title,
  description,
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  danger = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className={styles.overlay} onClick={onCancel} style={{ zIndex: 9999 }}>
      <div
        className={styles.dialog}
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 400, padding: 24, textAlign: "center" }}
      >
        <h3 className={styles.dialogTitle}>{title}</h3>
        <p className={styles.dialogMessage}>
          {description}
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: "10px 16px",
              background: "var(--surface-sunken)",
              border: "1px solid var(--line)",
              borderRadius: "var(--radius-sm)",
              color: "var(--ink-dark)",
              fontWeight: 500,
              cursor: "pointer",
              flex: 1,
            }}
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              padding: "10px 16px",
              background: danger ? "var(--red)" : "var(--brand)",
              border: "none",
              borderRadius: "var(--radius-sm)",
              color: "#fff",
              fontWeight: 500,
              cursor: "pointer",
              flex: 1,
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
