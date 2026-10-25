"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { DictationButton } from "@/components/treatments/DictationButton";
import { EvolutionImageUploader, type EvolutionImageItem } from "@/components/treatments/EvolutionImageUploader";
import { useEscapeToClose } from "@/lib/useEscapeToClose";
import { appendDictated, useDictation } from "@/lib/useDictation";
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
  /** Descrição atual de cada imagem mantida, por chave — só as chaves em `keepImageKeys` importam. */
  keepImageDescriptions: Record<string, string>;
  newImages: EvolutionImageItem[];
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
  const [keptDescriptions, setKeptDescriptions] = useState<Record<string, string>>({});
  const [newImages, setNewImages] = useState<EvolutionImageItem[]>([]);
  const dictation = useDictation((dictated) => setText((prev) => appendDictated(prev, dictated)));

  useEscapeToClose(onClose, open);

  // Para o ditado ao fechar o modal (Cancelar/×) — sem isso o microfone
  // continuava escutando em segundo plano até o modal reabrir.
  useEffect(() => {
    if (open) return;
    dictation.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    dictation.stop();
    if (initial) {
      setEvoDate(initial.evolution_date);
      setText(initial.text);
      setKeepImageKeys([...initial.image_keys]);
      const descriptions: Record<string, string> = {};
      initial.image_keys.forEach((key, i) => {
        descriptions[key] = initial.image_descriptions?.[i] ?? "";
      });
      setKeptDescriptions(descriptions);
    } else {
      setEvoDate(brDateOnly());
      setText("");
      setKeepImageKeys([]);
      setKeptDescriptions({});
    }
    setNewImages([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  if (!open || typeof document === "undefined") return null;

  const remainingSlots = Math.max(0, MAX_EVOLUTION_IMAGES - keepImageKeys.length);

  function handleSave() {
    dictation.stop();
    if (!text.trim()) return;
    onSave({ evolutionDate: evoDate, text: text.trim(), keepImageKeys, keepImageDescriptions: keptDescriptions, newImages });
  }

  return createPortal(
    <div className={uiStyles.overlay} style={{ zIndex: 260 }} onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div className={`${uiStyles.dialog} ${uiStyles.dialogXWide}`} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14, flexShrink: 0 }}>
          <h3 className={uiStyles.dialogTitle}>{initial ? "Editar evolução" : "Nova evolução"}</h3>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12, paddingRight: 6 }}>
          <div className={styles.formRow}>
            <div className={styles.field} style={{ maxWidth: 180 }}>
              <label className={styles.label}>Data*</label>
              <input type="date" className={styles.input} value={evoDate} onChange={(e) => setEvoDate(e.target.value)} />
            </div>
          </div>

          <div className={styles.field}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <label className={styles.label} style={{ marginBottom: 0 }}>
                Texto*
              </label>
              {dictation.supported && <DictationButton dictating={dictation.dictating} onToggle={dictation.toggle} />}
            </div>
            <textarea className={styles.input} rows={5} value={text} onChange={(e) => setText(e.target.value)} style={{ marginTop: 6 }} />
          </div>

          {initial && initial.image_keys.length > 0 && (
            <div>
              <label className={styles.label}>Imagens atuais</label>
              <div style={{ display: "flex", flexDirection: "column" }}>
                {initial.image_keys.map((key, i) => {
                  const kept = keepImageKeys.includes(key);
                  const name = initial.image_names?.[i];
                  return (
                    <div key={key} className={tp.evolutionFileRow} style={{ opacity: kept ? 1 : 0.45 }}>
                      <div className={tp.evolutionFileThumb}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/api/clinics/${clinicId}/treatment-evolutions/${initial.id}/images/${key.split("/").pop()}`} alt="" />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {name || "Imagem sem nome"}
                        </div>
                        <textarea
                          className={styles.input}
                          rows={2}
                          placeholder="Descrição (opcional)"
                          value={keptDescriptions[key] ?? ""}
                          onChange={(e) => setKeptDescriptions((prev) => ({ ...prev, [key]: e.target.value }))}
                          disabled={!kept}
                        />
                      </div>
                      <button
                        type="button"
                        className={tp.imageRemove}
                        style={{ position: "static", flexShrink: 0 }}
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
            <EvolutionImageUploader items={newImages} onChange={setNewImages} max={initial ? remainingSlots : MAX_EVOLUTION_IMAGES} />
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
