"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./ui.module.css";

export interface ToastMessage {
  id: number;
  text: string;
  tone: "error" | "success";
}

let nextToastId = 1;

export function useToasts() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((text: string, tone: ToastMessage["tone"] = "error") => {
    setToasts((prev) => [...prev, { id: nextToastId++, text, tone }]);
  }, []);

  return { toasts, push, dismiss };
}

export function ToastStack({ toasts, onDismiss }: { toasts: ToastMessage[]; onDismiss: (id: number) => void }) {
  if (typeof document === "undefined" || toasts.length === 0) return null;

  return createPortal(
    <div className={styles.toastStack}>
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>,
    document.body
  );
}

function ToastItem({ toast, onDismiss }: { toast: ToastMessage; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), 5000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast.id]);

  return (
    <div className={`${styles.toast} ${toast.tone === "error" ? styles.toastError : styles.toastSuccess}`}>
      <span>{toast.text}</span>
      <button type="button" className={styles.toastClose} onClick={() => onDismiss(toast.id)} aria-label="Fechar">
        ×
      </button>
    </div>
  );
}
