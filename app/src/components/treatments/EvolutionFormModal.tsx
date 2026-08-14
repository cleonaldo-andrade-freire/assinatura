"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EvolutionImageUploader, type EvolutionImageItem } from "@/components/treatments/EvolutionImageUploader";
import { brDateOnly } from "@/lib/date";
import type { TreatmentEvolution } from "@/lib/database.types";
import uiStyles from "@/components/ui/ui.module.css";
import styles from "@/styles/shell.module.css";
import tp from "./treatments.module.css";

const MAX_EVOLUTION_IMAGES = 5;

// Web Speech API — sem tipos no lib.dom padrão do TS, e só existe com
// prefixo "webkit" em boa parte dos navegadores (Chrome/Edge; sem suporte
// no Firefox desktop). Tipagem mínima só do que a gente usa.
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { resultIndex: number; results: { [i: number]: { isFinal: boolean; [j: number]: { transcript: string } }; length: number } }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

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
  const [dictating, setDictating] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  // Para o ditado ao fechar o modal (Cancelar/×) — sem isso o microfone
  // continuava escutando em segundo plano até o modal reabrir.
  useEffect(() => {
    if (open) return;
    recognitionRef.current?.stop();
    setDictating(false);
  }, [open]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    recognitionRef.current?.stop();
    setDictating(false);
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
  }, [open, initial]);

  if (!open || typeof document === "undefined") return null;

  const remainingSlots = Math.max(0, MAX_EVOLUTION_IMAGES - keepImageKeys.length);
  const speechSupported = getSpeechRecognitionCtor() !== undefined;

  function toggleDictation() {
    if (dictating) {
      recognitionRef.current?.stop();
      setDictating(false);
      return;
    }
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;
    const recognition = new Ctor();
    recognition.lang = "pt-BR";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) finalText += event.results[i][0].transcript;
      }
      if (finalText.trim()) {
        setText((prev) => (prev ? `${prev} ${finalText.trim()}` : finalText.trim()));
      }
    };
    recognition.onend = () => setDictating(false);
    recognition.onerror = () => setDictating(false);
    recognitionRef.current = recognition;
    recognition.start();
    setDictating(true);
  }

  function handleSave() {
    recognitionRef.current?.stop();
    if (!text.trim()) return;
    onSave({ evolutionDate: evoDate, text: text.trim(), keepImageKeys, keepImageDescriptions: keptDescriptions, newImages });
  }

  return createPortal(
    <div className={uiStyles.overlay} style={{ zIndex: 260 }} onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div className={`${uiStyles.dialog} ${uiStyles.dialogWide}`} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
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
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <label className={styles.label} style={{ marginBottom: 0 }}>
                Texto*
              </label>
              {speechSupported && (
                <button
                  type="button"
                  onClick={toggleDictation}
                  className={`${styles.btn} ${styles.btnGhost}`}
                  style={{ padding: "3px 10px", fontSize: 12, color: dictating ? "var(--danger)" : undefined, borderColor: dictating ? "var(--danger)" : undefined }}
                  title={dictating ? "Parar ditado" : "Ditar por voz"}
                >
                  {dictating ? "● Gravando… (clique pra parar)" : "🎤 Ditar por voz"}
                </button>
              )}
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
                        <img src={`/api/clinics/${clinicId}/treatment-evolutions/${initial.id}/images/${i}`} alt="" />
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
