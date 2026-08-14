"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { EvolutionImageUploader } from "@/components/treatments/EvolutionImageUploader";
import { brDateOnly } from "@/lib/date";
import type { TreatmentEvolution } from "@/lib/database.types";
import uiStyles from "@/components/ui/ui.module.css";
import styles from "@/styles/shell.module.css";
import tp from "./treatments.module.css";

const MAX_EVOLUTION_IMAGES = 5;

export interface EvolutionFormResult {
  evolutionDate: string;
  text: string;
  keepImageKeys: string[];
  newImages: File[];
}

/**
 * Modal dedicado pra adicionar/editar UMA evolução — aberto por cima do
 * modal de tratamento (nested, mesmo padrão do TreatmentFormModal: z-index
 * 260 + stopPropagation no fundo pro clique não vazar pro modal de trás).
 */
export function EvolutionFormModal({
  open,
  onClose,
  onSave,
  saving,
  clinicId,
  /** Presente = editando uma evolução existente; null = adicionando uma nova. */
  initial,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (values: EvolutionFormResult) => void;
  saving: boolean;
  clinicId: string;
  initial: TreatmentEvolution | null;
}) {
  const [evoDate, setEvoDate] = useState(brDateOnly());
  const [text, setText] = useState("");
  const [keepImageKeys, setKeepImageKeys] = useState<string[]>([]);
  const [newImages, setNewImages] = useState<File[]>([]);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setEvoDate(initial.evolution_date);
      setText(initial.text);
      setKeepImageKeys([...initial.image_keys]);
    } else {
      setEvoDate(brDateOnly());
      setText("");
      setKeepImageKeys([]);
    }
    setNewImages([]);
  }, [open, initial]);

  if (!open || typeof document === "undefined") return null;

  const remainingSlots = Math.max(0, MAX_EVOLUTION_IMAGES - keepImageKeys.length);

  function handleSave() {
    if (!text.trim()) return;
    onSave({ evolutionDate: evoDate, text: text.trim(), keepImageKeys, newImages });
  }

  return createPortal(
    <div className={uiStyles.overlay} style={{ zIndex: 260 }} onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div className={uiStyles.dialog} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14, flexShrink: 0 }}>
          <h3 className={uiStyles.dialogTitle}>{initial ? "Editar evolução" : "Nova evolução"}</h3>
          <button type="button" className={uiStyles.toastClose} onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12, paddingRight: 6 }}>
          <div className={styles.formRow}>
            <div className={styles.field} style={{ maxWidth: 180 }}>
              <label className={styles.label}>Data*</label>
              <input type="date" className={styles.input} value={evoDate} onChange={(e) => setEvoDate(e.target.value)} />
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Texto*</label>
            <textarea className={styles.input} rows={5} value={text} onChange={(e) => setText(e.target.value)} />
          </div>

          {initial && initial.image_keys.length > 0 && (
            <div>
              <label className={styles.label}>Imagens atuais</label>
              <div className={tp.evolutionImages}>
                {initial.image_keys.map((key, i) => {
                  const kept = keepImageKeys.includes(key);
                  return (
                    <div key={key} style={{ position: "relative", opacity: kept ? 1 : 0.35 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/clinics/${clinicId}/treatment-evolutions/${initial.id}/images/${i}`}
                        alt=""
                        className={tp.evolutionThumb}
                      />
                      <button
                        type="button"
                        className={tp.imageRemove}
                        style={{ position: "absolute", top: 3, right: 3 }}
                        onClick={() => setKeepImageKeys((prev) => (kept ? prev.filter((k) => k !== key) : [...prev, key]))}
                        title={kept ? "Remover" : "Manter"}
                      >
                        {kept ? "×" : "+"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <label className={styles.label}>{initial ? "Adicionar imagens" : `Imagens (opcional, até ${MAX_EVOLUTION_IMAGES})`}</label>
            <EvolutionImageUploader files={newImages} onChange={setNewImages} max={initial ? remainingSlots : MAX_EVOLUTION_IMAGES} />
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 14, marginTop: 10, borderTop: "1px solid var(--line-soft)", flexShrink: 0 }}>
          <button type="button" disabled={saving} onClick={onClose} className={`${styles.btn} ${styles.btnGhost}`}>
            Cancelar
          </button>
          <button type="button" disabled={saving} onClick={handleSave} className={`${styles.btn} ${styles.btnPrimary}`}>
            {saving ? "Salvando…" : initial ? "Salvar" : "Adicionar evolução"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
