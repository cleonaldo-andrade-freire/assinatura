"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { NewProsthesisOrderForm } from "@/components/NewProsthesisOrderForm";
import uiStyles from "@/components/ui/ui.module.css";
import shellStyles from "@/styles/shell.module.css";

/** Botão "+ Criar serviço" que abre o formulário em modal — mesmo padrão já
 * usado na agenda (NewAppointmentTrigger/NewAppointmentModal), pra manter a
 * criação de registros consistente entre os módulos do sistema. */
export function NewProsthesisOrderModal({ clinicId }: { clinicId: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button type="button" className={`${shellStyles.btn} ${shellStyles.btnPrimary}`} onClick={() => setOpen(true)}>
        + Criar serviço
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div className={uiStyles.overlay} onClick={() => setOpen(false)}>
            <div
              className={`${uiStyles.dialog} ${uiStyles.dialogWide}`}
              role="dialog"
              aria-modal="true"
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
                <h3 className={uiStyles.dialogTitle}>Novo serviço de prótese</h3>
                <button type="button" className={uiStyles.toastClose} onClick={() => setOpen(false)} aria-label="Fechar">
                  ×
                </button>
              </div>
              <NewProsthesisOrderForm bare clinicId={clinicId} onSuccess={() => setOpen(false)} />
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
