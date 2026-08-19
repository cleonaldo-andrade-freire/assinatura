"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import styles from "@/styles/shellMobileV2.module.css";

/**
 * Bottom sheet genérico do shell mobile v2 — mesmo idioma de
 * ConfirmDialog/Toast (portal em document.body, fecha no Escape), só que
 * sobe da borda inferior em vez de centralizar. Reutilizado pelo sheet de
 * ações rápidas do [+] e, nas fases seguintes, pelos wizards.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className={styles.sheetOverlay} onClick={onClose}>
      <div
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.sheetGrabber} />
        {title && <h2 className={styles.sheetTitle}>{title}</h2>}
        {children}
      </div>
    </div>,
    document.body
  );
}
