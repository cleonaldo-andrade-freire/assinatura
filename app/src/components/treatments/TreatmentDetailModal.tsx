"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ToastStack, useToasts } from "@/components/ui/Toast";
import { EvolutionImageUploader } from "@/components/treatments/EvolutionImageUploader";
import { formatMoneyDisplay, formatMoneyInput, parseMoneyInput } from "@/lib/money";
import { brDateOnly, formatBRDate } from "@/lib/date";
import type { Treatment, TreatmentEvolution } from "@/lib/database.types";
import uiStyles from "@/components/ui/ui.module.css";
import styles from "@/styles/shell.module.css";
import tp from "./treatments.module.css";

const MAX_EVOLUTION_IMAGES = 5;

/**
 * Tela de edição do tratamento — dados básicos editáveis em cima, histórico
 * completo de evoluções embaixo (uma linha por sessão registrada, cada uma
 * podendo ter até 5 fotos), com opção de lançar uma nova evolução na hora.
 */
export function TreatmentDetailModal({
  open,
  onClose,
  clinicId,
  treatment,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  clinicId: string;
  treatment: Treatment | null;
  onSaved: (updated: Treatment) => void;
}) {
  const router = useRouter();
  const { toasts, push, dismiss } = useToasts();

  const [name, setName] = useState("");
  const [tooth, setTooth] = useState("");
  const [price, setPrice] = useState("");
  const [savingFields, setSavingFields] = useState(false);

  const [evolutions, setEvolutions] = useState<TreatmentEvolution[]>([]);
  const [loadingEvolutions, setLoadingEvolutions] = useState(false);

  const [addingEvolution, setAddingEvolution] = useState(false);
  const [evoDate, setEvoDate] = useState(brDateOnly());
  const [evoText, setEvoText] = useState("");
  const [evoImages, setEvoImages] = useState<File[]>([]);
  const [savingEvolution, setSavingEvolution] = useState(false);

  const [confirmDeleteEvolutionId, setConfirmDeleteEvolutionId] = useState<string | null>(null);
  const [deletingEvolutionId, setDeletingEvolutionId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !treatment) return;
    setName(treatment.treatment_name);
    setTooth(treatment.tooth_region ?? "");
    setPrice(formatMoneyDisplay(treatment.price));
    setAddingEvolution(false);
    setEvoDate(brDateOnly());
    setEvoText("");
    setEvoImages([]);

    setLoadingEvolutions(true);
    fetch(`/api/clinics/${clinicId}/treatments/${treatment.id}/evolutions`)
      .then((res) => res.json())
      .then((data) => setEvolutions(data.evolutions ?? []))
      .catch(() => push("Falha ao carregar as evoluções."))
      .finally(() => setLoadingEvolutions(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, treatment?.id]);

  if (!treatment) return null;

  async function handleSaveFields() {
    if (!treatment) return;
    if (!name.trim()) {
      push("Preencha o nome do tratamento.");
      return;
    }
    setSavingFields(true);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/treatments/${treatment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ treatment_name: name.trim(), tooth_region: tooth.trim() || null, price: parseMoneyInput(price) }),
      });
      const data = await res.json();
      if (!res.ok) {
        push("Falha ao salvar. Tenta de novo.");
        return;
      }
      onSaved(data.treatment as Treatment);
      push("Tratamento atualizado.", "success");
      router.refresh();
    } finally {
      setSavingFields(false);
    }
  }

  async function handleAddEvolution() {
    if (!treatment) return;
    if (!evoText.trim()) {
      push("Preencha o texto da evolução.");
      return;
    }
    setSavingEvolution(true);
    try {
      const form = new FormData();
      form.set("evolution_date", evoDate);
      form.set("text", evoText.trim());
      evoImages.forEach((file) => form.append("images", file));

      const res = await fetch(`/api/clinics/${clinicId}/treatments/${treatment.id}/evolutions`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        push("Falha ao salvar a evolução. Tenta de novo.");
        return;
      }
      setEvolutions((prev) => [data.evolution as TreatmentEvolution, ...prev]);
      setAddingEvolution(false);
      setEvoText("");
      setEvoImages([]);
      push("Evolução adicionada.", "success");
    } finally {
      setSavingEvolution(false);
    }
  }

  async function handleDeleteEvolution(id: string) {
    setDeletingEvolutionId(id);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/treatment-evolutions/${id}`, { method: "DELETE" });
      if (!res.ok) {
        push("Falha ao excluir. Tenta de novo.");
        return;
      }
      setEvolutions((prev) => prev.filter((e) => e.id !== id));
      setConfirmDeleteEvolutionId(null);
    } finally {
      setDeletingEvolutionId(null);
    }
  }

  return (
    <>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div className={uiStyles.overlay} onClick={onClose}>
            <div className={`${uiStyles.dialog} ${uiStyles.dialogExtraWide}`} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14, flexShrink: 0 }}>
                <h3 className={uiStyles.dialogTitle}>Editar tratamento</h3>
                <button type="button" className={uiStyles.toastClose} onClick={onClose} aria-label="Fechar">
                  ×
                </button>
              </div>

              <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 20, paddingRight: 6 }}>
                <div>
                  <div className={styles.formRow}>
                    <div className={styles.field} style={{ flex: 2 }}>
                      <label className={styles.label}>Tratamento*</label>
                      <input type="text" className={styles.input} value={name} onChange={(e) => setName(e.target.value)} />
                    </div>
                    <div className={styles.field} style={{ width: 120 }}>
                      <label className={styles.label}>Dente/Região</label>
                      <input type="text" className={styles.input} value={tooth} onChange={(e) => setTooth(e.target.value)} />
                    </div>
                    <div className={styles.field} style={{ width: 130 }}>
                      <label className={styles.label}>Valor*</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        className={styles.input}
                        value={price}
                        onChange={(e) => setPrice(formatMoneyInput(e.target.value))}
                      />
                    </div>
                  </div>
                  <button type="button" disabled={savingFields} onClick={handleSaveFields} className={`${styles.btn} ${styles.btnPrimary}`} style={{ marginTop: 4 }}>
                    {savingFields ? "Salvando…" : "Salvar"}
                  </button>
                </div>

                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <p className={styles.fgroupLabel} style={{ margin: 0 }}>
                      Evoluções
                    </p>
                    {!addingEvolution && (
                      <button type="button" onClick={() => setAddingEvolution(true)} className={`${styles.btn} ${styles.btnGhost}`}>
                        + Nova evolução
                      </button>
                    )}
                  </div>

                  {addingEvolution && (
                    <div className={tp.evolutionCard} style={{ marginBottom: 12 }}>
                      <div className={styles.formRow}>
                        <div className={styles.field} style={{ maxWidth: 180 }}>
                          <label className={styles.label}>Data*</label>
                          <input type="date" className={styles.input} value={evoDate} onChange={(e) => setEvoDate(e.target.value)} />
                        </div>
                      </div>
                      <div className={styles.field} style={{ marginTop: 8 }}>
                        <label className={styles.label}>Texto*</label>
                        <textarea className={styles.input} rows={3} value={evoText} onChange={(e) => setEvoText(e.target.value)} />
                      </div>
                      <div style={{ marginTop: 10 }}>
                        <label className={styles.label}>Imagens (opcional, até {MAX_EVOLUTION_IMAGES})</label>
                        <EvolutionImageUploader files={evoImages} onChange={setEvoImages} max={MAX_EVOLUTION_IMAGES} />
                      </div>
                      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                        <button type="button" disabled={savingEvolution} onClick={handleAddEvolution} className={`${styles.btn} ${styles.btnPrimary}`}>
                          {savingEvolution ? "Salvando…" : "Adicionar evolução"}
                        </button>
                        <button
                          type="button"
                          disabled={savingEvolution}
                          onClick={() => {
                            setAddingEvolution(false);
                            setEvoText("");
                            setEvoImages([]);
                          }}
                          className={`${styles.btn} ${styles.btnGhost}`}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}

                  {loadingEvolutions ? (
                    <p style={{ color: "var(--ink-soft)", fontSize: 13.5 }}>Carregando…</p>
                  ) : evolutions.length === 0 ? (
                    <p style={{ color: "var(--ink-soft)", fontSize: 13.5 }}>Nenhuma evolução registrada ainda.</p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {evolutions.map((e) => (
                        <div key={e.id} className={tp.evolutionCard}>
                          <div className={tp.evolutionHeader}>
                            <span className={tp.evolutionDate}>{formatBRDate(`${e.evolution_date}T12:00:00-03:00`)}</span>
                            <button
                              type="button"
                              disabled={deletingEvolutionId === e.id}
                              onClick={() => setConfirmDeleteEvolutionId(e.id)}
                              style={{ border: "none", background: "none", color: "var(--danger)", cursor: "pointer", fontSize: 12 }}
                            >
                              Excluir
                            </button>
                          </div>
                          <p className={tp.evolutionText}>{e.text}</p>
                          {e.image_keys.length > 0 && (
                            <div className={tp.evolutionImages}>
                              {e.image_keys.map((_, i) => (
                                <a
                                  key={i}
                                  href={`/api/clinics/${clinicId}/treatment-evolutions/${e.id}/images/${i}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className={tp.evolutionThumb}
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={`/api/clinics/${clinicId}/treatment-evolutions/${e.id}/images/${i}`} alt="" />
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <ConfirmDialog
              open={confirmDeleteEvolutionId !== null}
              title="Excluir evolução"
              message="Isso remove este registro de evolução e as imagens anexadas a ele."
              confirmLabel="Excluir"
              cancelLabel="Cancelar"
              danger
              loading={deletingEvolutionId !== null}
              onConfirm={() => confirmDeleteEvolutionId && handleDeleteEvolution(confirmDeleteEvolutionId)}
              onCancel={() => setConfirmDeleteEvolutionId(null)}
            />
            <ToastStack toasts={toasts} onDismiss={dismiss} />
          </div>,
          document.body
        )}
    </>
  );
}
