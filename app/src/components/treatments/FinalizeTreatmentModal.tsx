"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { brDateOnly } from "@/lib/date";
import { buildFinalizationText } from "@/lib/treatments";
import { useEscapeToClose } from "@/lib/useEscapeToClose";
import type { Treatment } from "@/lib/database.types";
import uiStyles from "@/components/ui/ui.module.css";
import styles from "@/styles/shell.module.css";

/**
 * Confirmação de finalização (um tratamento ou vários juntos) — texto de
 * evolução já vem pronto (gerado a partir dos tratamentos sendo
 * finalizados), mas fica livre pra edição antes de salvar.
 */
export function FinalizeTreatmentModal({
  open,
  onClose,
  onConfirm,
  treatments,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (finalizedAt: string, evolutionText: string) => Promise<void> | void;
  treatments: Treatment[];
}) {
  const [finalizedAt, setFinalizedAt] = useState(brDateOnly());
  const [evolutionText, setEvolutionText] = useState("");
  const [saving, setSaving] = useState(false);

  useEscapeToClose(onClose, open);

  useEffect(() => {
    if (!open) return;
    setFinalizedAt(brDateOnly());
    setEvolutionText(buildFinalizationText(treatments));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handleConfirm() {
    if (!evolutionText.trim()) return;
    setSaving(true);
    try {
      await onConfirm(finalizedAt, evolutionText.trim());
    } finally {
      setSaving(false);
    }
  }

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className={uiStyles.overlay} onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div className={`${uiStyles.dialog} ${uiStyles.dialogWide}`} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h3 className={uiStyles.dialogTitle}>Finalizar tratamento{treatments.length > 1 ? "s" : ""}</h3>

        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 6 }}>
          <div className={styles.field} style={{ maxWidth: 200 }}>
            <label className={styles.label}>Data*</label>
            <input type="date" className={styles.input} value={finalizedAt} onChange={(e) => setFinalizedAt(e.target.value)} required />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Evolução*</label>
            <textarea className={styles.input} rows={4} value={evolutionText} onChange={(e) => setEvolutionText(e.target.value)} />
          </div>
        </div>

        <div className={uiStyles.dialogActions} style={{ marginTop: 20 }}>
          <button type="button" className={uiStyles.dialogBtnGhost} onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="button" className={uiStyles.dialogBtnPrimary} onClick={handleConfirm} disabled={saving || !evolutionText.trim()}>
            {saving ? "Finalizando…" : "Finalizar"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
