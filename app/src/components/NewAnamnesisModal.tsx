"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { NewAnamnesisForm } from "@/components/NewAnamnesisForm";
import type { QuestionTemplate } from "@/lib/database.types";
import uiStyles from "@/components/ui/ui.module.css";

/** Diálogo de "Nova anamnese" — usado pelo botão da aba Anamneses na ficha do
 * paciente, com o paciente já pré-preenchido (mesmo padrão do NewAppointmentModal). */
export function NewAnamnesisModal({
  open,
  onClose,
  clinicId,
  templates,
  patientName,
  patientPhone,
}: {
  open: boolean;
  onClose: () => void;
  clinicId: string;
  templates: QuestionTemplate[];
  patientName?: string;
  patientPhone?: string | null;
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
      <div className={uiStyles.dialog} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
          <h3 className={uiStyles.dialogTitle}>Nova anamnese</h3>
          <button type="button" className={uiStyles.toastClose} onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>

        <NewAnamnesisForm
          bare
          clinicId={clinicId}
          templates={templates}
          initialPatientName={patientName}
          initialPatientPhone={patientPhone}
          onSuccess={onClose}
        />
      </div>
    </div>,
    document.body
  );
}
