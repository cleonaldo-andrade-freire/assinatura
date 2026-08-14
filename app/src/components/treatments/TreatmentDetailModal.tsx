"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ToothRegionSelect } from "@/components/budgets/ToothRegionSelect";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ToastStack, useToasts } from "@/components/ui/Toast";
import { EvolutionImageUploader } from "@/components/treatments/EvolutionImageUploader";
import { formatMoneyDisplay, formatMoneyInput, parseMoneyInput } from "@/lib/money";
import { brDateOnly, formatBRDate, formatBRTime } from "@/lib/date";
import type { PriceTable, PriceTableItem, Treatment, TreatmentEvolution } from "@/lib/database.types";
import uiStyles from "@/components/ui/ui.module.css";
import styles from "@/styles/shell.module.css";
import tp from "./treatments.module.css";

const CUSTOM_TREATMENT_VALUE = "__custom__";
const MAX_EVOLUTION_IMAGES = 5;

interface CatalogTable extends PriceTable {
  items: PriceTableItem[];
}

/**
 * Tela de edição do tratamento — os mesmos campos (Plano/Tratamento/Valor +
 * odontograma) da tela de adicionar tratamento no orçamento, só que pra UM
 * dente só (editar não divide um tratamento em vários) — mais o histórico
 * de evoluções embaixo, com CRUD completo (adicionar, editar, excluir),
 * mesmo padrão do resto do projeto.
 */
export function TreatmentDetailModal({
  open,
  onClose,
  clinicId,
  treatment,
  onSaved,
  onDeleted,
}: {
  open: boolean;
  onClose: () => void;
  clinicId: string;
  treatment: Treatment | null;
  onSaved: (updated: Treatment) => void;
  onDeleted: (id: string) => void;
}) {
  const router = useRouter();
  const { toasts, push, dismiss } = useToasts();

  const [catalog, setCatalog] = useState<CatalogTable[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  const [priceTableId, setPriceTableId] = useState("");
  const [treatmentId, setTreatmentId] = useState("");
  const [customName, setCustomName] = useState("");
  const [price, setPrice] = useState("");
  const [toothSelection, setToothSelection] = useState<string[]>([]);
  const [savingFields, setSavingFields] = useState(false);

  const [confirmDeleteTreatmentOpen, setConfirmDeleteTreatmentOpen] = useState(false);
  const [deletingTreatment, setDeletingTreatment] = useState(false);

  const [evolutions, setEvolutions] = useState<TreatmentEvolution[]>([]);
  const [loadingEvolutions, setLoadingEvolutions] = useState(false);

  const [addingEvolution, setAddingEvolution] = useState(false);
  const [evoDate, setEvoDate] = useState(brDateOnly());
  const [evoText, setEvoText] = useState("");
  const [evoImages, setEvoImages] = useState<File[]>([]);
  const [savingEvolution, setSavingEvolution] = useState(false);

  const [editingEvolutionId, setEditingEvolutionId] = useState<string | null>(null);
  const [editEvoDate, setEditEvoDate] = useState("");
  const [editEvoText, setEditEvoText] = useState("");
  const [editEvoKeepKeys, setEditEvoKeepKeys] = useState<string[]>([]);
  const [editEvoNewImages, setEditEvoNewImages] = useState<File[]>([]);
  const [savingEvolutionEdit, setSavingEvolutionEdit] = useState(false);

  const [confirmDeleteEvolutionId, setConfirmDeleteEvolutionId] = useState<string | null>(null);
  const [deletingEvolutionId, setDeletingEvolutionId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoadingCatalog(true);
    fetch(`/api/clinics/${clinicId}/price-tables/catalog`)
      .then((res) => res.json())
      .then((data) => setCatalog(data.priceTables ?? []))
      .catch(() => push("Falha ao carregar tabelas de tratamento."))
      .finally(() => setLoadingCatalog(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, treatment?.id]);

  // Preenche os campos a partir do tratamento — casamento por NOME com o
  // catálogo (não guardamos price_table_item_id no tratamento), então só
  // roda depois que o catálogo chega.
  useEffect(() => {
    if (!open || !treatment) return;
    const table = catalog.find((t) => t.name === treatment.price_table_name);
    const item = table?.items.find((i) => i.name === treatment.treatment_name);
    setPriceTableId(table?.id ?? "");
    setTreatmentId(item?.id ?? (table ? CUSTOM_TREATMENT_VALUE : ""));
    setCustomName(item ? "" : treatment.treatment_name);
    setPrice(formatMoneyDisplay(treatment.price));
    setToothSelection(treatment.tooth_region ? [treatment.tooth_region] : []);
  }, [open, treatment, catalog]);

  useEffect(() => {
    if (!open || !treatment) return;
    setAddingEvolution(false);
    setEditingEvolutionId(null);
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

  const selectedTable = catalog.find((t) => t.id === priceTableId);
  const isCustomTreatment = treatmentId === CUSTOM_TREATMENT_VALUE;

  async function handleSaveFields() {
    if (!treatment) return;
    const treatmentName = isCustomTreatment ? customName.trim() : selectedTable?.items.find((i) => i.id === treatmentId)?.name ?? "";
    if (!treatmentName || !price) {
      push("Preencha tratamento e valor.");
      return;
    }
    setSavingFields(true);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/treatments/${treatment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          treatment_name: treatmentName,
          tooth_region: toothSelection[0] || null,
          price: parseMoneyInput(price),
          price_table_name: selectedTable?.name ?? null,
        }),
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

  async function handleDeleteTreatment() {
    if (!treatment) return;
    setDeletingTreatment(true);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/treatments/${treatment.id}`, { method: "DELETE" });
      if (!res.ok) {
        push("Falha ao excluir. Tenta de novo.");
        return;
      }
      onDeleted(treatment.id);
      setConfirmDeleteTreatmentOpen(false);
      onClose();
      router.refresh();
    } finally {
      setDeletingTreatment(false);
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

  function startEditEvolution(e: TreatmentEvolution) {
    setEditingEvolutionId(e.id);
    setEditEvoDate(e.evolution_date);
    setEditEvoText(e.text);
    setEditEvoKeepKeys([...e.image_keys]);
    setEditEvoNewImages([]);
  }

  async function handleSaveEvolutionEdit(e: TreatmentEvolution) {
    if (!editEvoText.trim()) {
      push("Preencha o texto da evolução.");
      return;
    }
    setSavingEvolutionEdit(true);
    try {
      const form = new FormData();
      form.set("evolution_date", editEvoDate);
      form.set("text", editEvoText.trim());
      form.set("keep_image_keys", JSON.stringify(editEvoKeepKeys));
      editEvoNewImages.forEach((file) => form.append("images", file));

      const res = await fetch(`/api/clinics/${clinicId}/treatment-evolutions/${e.id}`, { method: "PATCH", body: form });
      const data = await res.json();
      if (!res.ok) {
        push("Falha ao salvar a evolução. Tenta de novo.");
        return;
      }
      setEvolutions((prev) => prev.map((ev) => (ev.id === e.id ? (data.evolution as TreatmentEvolution) : ev)));
      setEditingEvolutionId(null);
      push("Evolução atualizada.", "success");
    } finally {
      setSavingEvolutionEdit(false);
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
                    <div className={styles.field}>
                      <label className={styles.label}>Plano*</label>
                      <select
                        className={styles.select}
                        value={priceTableId}
                        onChange={(e) => {
                          setPriceTableId(e.target.value);
                          setTreatmentId("");
                        }}
                        disabled={loadingCatalog}
                      >
                        <option value="">Selecione…</option>
                        {catalog.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className={styles.field} style={{ width: 140 }}>
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

                  <div className={styles.field}>
                    <label className={styles.label}>Tratamento*</label>
                    <select
                      className={styles.select}
                      value={treatmentId}
                      onChange={(e) => {
                        const v = e.target.value;
                        setTreatmentId(v);
                        if (v !== CUSTOM_TREATMENT_VALUE) {
                          const item = selectedTable?.items.find((i) => i.id === v);
                          if (item) setPrice(formatMoneyDisplay(item.price));
                        }
                      }}
                      disabled={!priceTableId}
                    >
                      <option value="">Selecione…</option>
                      {selectedTable?.items.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.specialty ? `${i.specialty} — ${i.name}` : i.name}
                        </option>
                      ))}
                      <option value={CUSTOM_TREATMENT_VALUE}>+ Tratamento avulso (digitar nome)</option>
                    </select>
                  </div>

                  {isCustomTreatment && (
                    <div className={styles.field} style={{ marginTop: 10 }}>
                      <label className={styles.label}>Nome do tratamento*</label>
                      <input type="text" className={styles.input} value={customName} onChange={(e) => setCustomName(e.target.value)} />
                    </div>
                  )}

                  <div style={{ marginTop: 10 }}>
                    <ToothRegionSelect value={toothSelection} onChange={setToothSelection} single />
                  </div>

                  <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                    <button type="button" disabled={savingFields} onClick={handleSaveFields} className={`${styles.btn} ${styles.btnPrimary}`}>
                      {savingFields ? "Salvando…" : "Salvar"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteTreatmentOpen(true)}
                      className={`${styles.btn} ${styles.btnGhost}`}
                      style={{ color: "var(--danger)" }}
                    >
                      Excluir tratamento
                    </button>
                  </div>
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
                      {evolutions.map((e) =>
                        editingEvolutionId === e.id ? (
                          <div key={e.id} className={tp.evolutionCard}>
                            <div className={styles.formRow}>
                              <div className={styles.field} style={{ maxWidth: 180 }}>
                                <label className={styles.label}>Data*</label>
                                <input type="date" className={styles.input} value={editEvoDate} onChange={(ev) => setEditEvoDate(ev.target.value)} />
                              </div>
                            </div>
                            <div className={styles.field} style={{ marginTop: 8 }}>
                              <label className={styles.label}>Texto*</label>
                              <textarea className={styles.input} rows={3} value={editEvoText} onChange={(ev) => setEditEvoText(ev.target.value)} />
                            </div>
                            {e.image_keys.length > 0 && (
                              <div style={{ marginTop: 10 }}>
                                <label className={styles.label}>Imagens atuais</label>
                                <div className={tp.evolutionImages}>
                                  {e.image_keys.map((key, i) => {
                                    const kept = editEvoKeepKeys.includes(key);
                                    return (
                                      <div key={key} style={{ position: "relative", opacity: kept ? 1 : 0.35 }}>
                                        <a href={`/api/clinics/${clinicId}/treatment-evolutions/${e.id}/images/${i}`} target="_blank" rel="noreferrer" className={tp.evolutionThumb}>
                                          {/* eslint-disable-next-line @next/next/no-img-element */}
                                          <img src={`/api/clinics/${clinicId}/treatment-evolutions/${e.id}/images/${i}`} alt="" />
                                        </a>
                                        <button
                                          type="button"
                                          className={tp.imageRemove}
                                          style={{ position: "absolute", top: 3, right: 3 }}
                                          onClick={() =>
                                            setEditEvoKeepKeys((prev) => (kept ? prev.filter((k) => k !== key) : [...prev, key]))
                                          }
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
                            <div style={{ marginTop: 10 }}>
                              <label className={styles.label}>Adicionar imagens</label>
                              <EvolutionImageUploader
                                files={editEvoNewImages}
                                onChange={setEditEvoNewImages}
                                max={Math.max(0, MAX_EVOLUTION_IMAGES - editEvoKeepKeys.length)}
                              />
                            </div>
                            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                              <button
                                type="button"
                                disabled={savingEvolutionEdit}
                                onClick={() => handleSaveEvolutionEdit(e)}
                                className={`${styles.btn} ${styles.btnPrimary}`}
                              >
                                {savingEvolutionEdit ? "Salvando…" : "Salvar"}
                              </button>
                              <button
                                type="button"
                                disabled={savingEvolutionEdit}
                                onClick={() => setEditingEvolutionId(null)}
                                className={`${styles.btn} ${styles.btnGhost}`}
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div key={e.id} className={tp.evolutionCard}>
                            <div className={tp.evolutionHeader}>
                              <span className={tp.evolutionDate}>
                                {formatBRDate(`${e.evolution_date}T12:00:00-03:00`)} · {formatBRTime(e.created_at)}
                              </span>
                              <div style={{ display: "flex", gap: 10 }}>
                                <button
                                  type="button"
                                  onClick={() => startEditEvolution(e)}
                                  style={{ border: "none", background: "none", color: "var(--brand)", cursor: "pointer", fontSize: 12 }}
                                >
                                  Editar
                                </button>
                                <button
                                  type="button"
                                  disabled={deletingEvolutionId === e.id}
                                  onClick={() => setConfirmDeleteEvolutionId(e.id)}
                                  style={{ border: "none", background: "none", color: "var(--danger)", cursor: "pointer", fontSize: 12 }}
                                >
                                  Excluir
                                </button>
                              </div>
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
                        )
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <ConfirmDialog
              open={confirmDeleteTreatmentOpen}
              title="Excluir tratamento"
              message="Isso remove o tratamento e as evoluções registradas nele da ficha do paciente. O orçamento que gerou ele não é afetado."
              confirmLabel="Excluir"
              cancelLabel="Cancelar"
              danger
              loading={deletingTreatment}
              onConfirm={handleDeleteTreatment}
              onCancel={() => setConfirmDeleteTreatmentOpen(false)}
            />

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
