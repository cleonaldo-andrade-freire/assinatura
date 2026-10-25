"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { DictationButton } from "@/components/treatments/DictationButton";
import { brDateOnly } from "@/lib/date";
import { buildFinalizationText } from "@/lib/treatments";
import { appendDictated, useDictation } from "@/lib/useDictation";
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
  onConfirm: (finalizedAt: string, evolutionText: string, notifyPatient: boolean) => Promise<void> | void;
  treatments: Treatment[];
}) {
  const [finalizedAt, setFinalizedAt] = useState(brDateOnly());
  const [evolutionText, setEvolutionText] = useState("");
  // Desmarcada por padrão — envio ao paciente só por escolha explícita
  // (evita mensagens automáticas, risco de bloqueio do WhatsApp da clínica).
  const [notifyPatient, setNotifyPatient] = useState(false);
  const [saving, setSaving] = useState(false);
  const dictation = useDictation((dictated) => setEvolutionText((prev) => appendDictated(prev, dictated)));

  useEscapeToClose(onClose, open);

  useEffect(() => {
    dictation.stop();
    if (!open) return;
    setFinalizedAt(brDateOnly());
    setEvolutionText(buildFinalizationText(treatments));
    setNotifyPatient(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handleConfirm() {
    dictation.stop();
    if (!evolutionText.trim()) return;
    setSaving(true);
    try {
      await onConfirm(finalizedAt, evolutionText.trim(), notifyPatient);
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
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <label className={styles.label} style={{ marginBottom: 0 }}>
                Evolução*
              </label>
              {dictation.supported && <DictationButton dictating={dictation.dictating} onToggle={dictation.toggle} />}
            </div>
            <textarea className={styles.input} rows={4} value={evolutionText} onChange={(e) => setEvolutionText(e.target.value)} style={{ marginTop: 6 }} />
          </div>

          <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 14, cursor: "pointer" }}>
            <input type="checkbox" checked={notifyPatient} onChange={(e) => setNotifyPatient(e.target.checked)} style={{ marginTop: 3 }} />
            <span>
              Enviar ao paciente para assinar por WhatsApp
              <span style={{ display: "block", fontSize: 12, color: "var(--ink-soft)" }}>
                O paciente recebe uma única mensagem para assinar concordando com o que foi realizado. Sem marcar, dá pra
                solicitar depois pelo ícone do WhatsApp no tratamento.
              </span>
            </span>
          </label>
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
