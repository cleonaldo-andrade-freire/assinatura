"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { PatientForm } from "@/components/PatientForm";
import uiStyles from "@/components/ui/ui.module.css";

export function NewPatientModal({
  open,
  onClose,
  clinicId,
}: {
  open: boolean;
  onClose: () => void;
  clinicId: string;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

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
    <div className={uiStyles.overlay} onClick={onClose}>
      <div className={`${uiStyles.dialog} ${uiStyles.dialogWide}`} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 600 }}>
        <button type="button" className={uiStyles.dialogClose} onClick={onClose} aria-label="Fechar" style={{ position: "absolute", top: 12, right: 12, background: "none", border: "none", cursor: "pointer", color: "var(--ink-soft)" }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
        <div style={{ marginBottom: 20 }}>
          <h2 className={uiStyles.dialogTitle}>Novo paciente</h2>
        </div>
        <div style={{ padding: 4 }}>
          <PatientForm clinicId={clinicId} isModal={true} onSuccess={onClose} />
        </div>
      </div>
    </div>,
    document.body
  );
}
