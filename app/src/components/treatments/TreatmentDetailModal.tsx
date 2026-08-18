"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ToothRegionSelect } from "@/components/budgets/ToothRegionSelect";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ToastStack, useToasts } from "@/components/ui/Toast";
import { ImageLightbox } from "@/components/ui/ImageLightbox";
import { EvolutionFormModal, type EvolutionFormResult } from "@/components/treatments/EvolutionFormModal";
import { useEscapeToClose } from "@/lib/useEscapeToClose";
import { formatMoneyDisplay, formatMoneyInput, parseMoneyInput } from "@/lib/money";
import { formatBRDate, formatBRTime } from "@/lib/date";
import { sortFavoritesFirst, treatmentOptionLabel } from "@/lib/priceTables";
import type { PriceTable, PriceTableItem, Treatment, TreatmentEvolution } from "@/lib/database.types";
import uiStyles from "@/components/ui/ui.module.css";
import styles from "@/styles/shell.module.css";
import tp from "./treatments.module.css";

const CUSTOM_TREATMENT_VALUE = "__custom__";
const EVOLUTION_TRUNCATE_LENGTH = 260;

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
}: {
  open: boolean;
  onClose: () => void;
  clinicId: string;
  treatment: Treatment | null;
  onSaved: (updated: Treatment) => void;
}) {
  const router = useRouter();
  const { toasts, push, dismiss } = useToasts();

  const [catalog, setCatalog] = useState<CatalogTable[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  const [priceTableId, setPriceTableId] = useState("");
  const [treatmentId, setTreatmentId] = useState("");
  const [customName, setCustomName] = useState("");
  const [treatmentSearch, setTreatmentSearch] = useState("");
  const [showTreatmentSuggestions, setShowTreatmentSuggestions] = useState(false);
  const [price, setPrice] = useState("");
  const [toothSelection, setToothSelection] = useState<string[]>([]);
  const [savingFields, setSavingFields] = useState(false);

  const [evolutions, setEvolutions] = useState<TreatmentEvolution[]>([]);
  const [loadingEvolutions, setLoadingEvolutions] = useState(false);

  const [evolutionModalOpen, setEvolutionModalOpen] = useState(false);
  const [evolutionModalInitial, setEvolutionModalInitial] = useState<TreatmentEvolution | null>(null);
  const [savingEvolution, setSavingEvolution] = useState(false);

  const [expandedEvolutionIds, setExpandedEvolutionIds] = useState<string[]>([]);
  const [lightboxEvolutionId, setLightboxEvolutionId] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const [confirmDeleteEvolutionId, setConfirmDeleteEvolutionId] = useState<string | null>(null);
  const [deletingEvolutionId, setDeletingEvolutionId] = useState<string | null>(null);

  // Suprime o Esc daqui enquanto algo aninhado por cima (evolução ou um
  // ConfirmDialog) já trata o próprio Esc — senão os dois fechariam juntos.
  useEscapeToClose(onClose, open && !evolutionModalOpen && confirmDeleteEvolutionId === null);

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
    setTreatmentSearch(item ? treatmentOptionLabel(item) : treatment.treatment_name);
    setPrice(formatMoneyDisplay(treatment.price));
    setToothSelection(treatment.tooth_region ? [treatment.tooth_region] : []);
  }, [open, treatment, catalog]);

  useEffect(() => {
    if (!open || !treatment) return;
    setEvolutionModalOpen(false);
    setEvolutionModalInitial(null);
    setExpandedEvolutionIds([]);

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

  function openAddEvolution() {
    setEvolutionModalInitial(null);
    setEvolutionModalOpen(true);
  }

  function openEditEvolution(e: TreatmentEvolution) {
    setEvolutionModalInitial(e);
    setEvolutionModalOpen(true);
  }

  async function handleSaveEvolution(values: EvolutionFormResult) {
    if (!treatment) return;
    setSavingEvolution(true);
    try {
      const form = new FormData();
      form.set("evolution_date", values.evolutionDate);
      form.set("text", values.text);
      values.newImages.forEach((item) => {
        form.append("images", item.file);
        form.append("new_image_descriptions", item.description);
      });

      if (evolutionModalInitial) {
        form.set("keep_image_keys", JSON.stringify(values.keepImageKeys));
        form.set("keep_image_descriptions", JSON.stringify(values.keepImageDescriptions));
        const res = await fetch(`/api/clinics/${clinicId}/treatment-evolutions/${evolutionModalInitial.id}`, { method: "PATCH", body: form });
        const data = await res.json();
        if (!res.ok) {
          push("Falha ao salvar a evolução. Tenta de novo.");
          return;
        }
        setEvolutions((prev) => prev.map((ev) => (ev.id === evolutionModalInitial.id ? (data.evolution as TreatmentEvolution) : ev)));
        push("Evolução atualizada.", "success");
      } else {
        const res = await fetch(`/api/clinics/${clinicId}/treatments/${treatment.id}/evolutions`, { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) {
          push("Falha ao salvar a evolução. Tenta de novo.");
          return;
        }
        setEvolutions((prev) => [data.evolution as TreatmentEvolution, ...prev]);
        push("Evolução adicionada.", "success");
      }
      setEvolutionModalOpen(false);
    } finally {
      setSavingEvolution(false);
    }
  }

  function toggleExpanded(id: string) {
    setExpandedEvolutionIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
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
              </div>

              <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 20, paddingRight: 6 }}>
                <div>
                  <div className={styles.formRow} style={{ gridTemplateColumns: "140px 1fr 140px", alignItems: "flex-start" }}>
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

                    <div className={styles.field} style={{ position: "relative" }}>
                      <label className={styles.label}>Tratamento*</label>
                      <input
                        type="text"
                        className={styles.input}
                        value={treatmentSearch}
                        onChange={(e) => {
                          const v = e.target.value;
                          setTreatmentSearch(v);
                          setShowTreatmentSuggestions(true);
                          if (v !== selectedTable?.items.find((i) => i.id === treatmentId)?.name) {
                            setTreatmentId("");
                            setPrice("");
                          }
                        }}
                        onFocus={() => setShowTreatmentSuggestions(true)}
                        onBlur={() => setTimeout(() => setShowTreatmentSuggestions(false), 150)}
                        disabled={!priceTableId}
                        placeholder="Digite para buscar…"
                      />
                      {showTreatmentSuggestions && priceTableId && (
                        <ul
                          style={{
                            position: "absolute",
                            top: "100%",
                            left: 0,
                            right: 0,
                            zIndex: 5,
                            margin: "4px 0 0",
                            padding: 4,
                            listStyle: "none",
                            background: "var(--surface)",
                            border: "1.5px solid var(--line)",
                            borderRadius: "var(--radius-sm)",
                            boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
                            maxHeight: 220,
                            overflowY: "auto",
                          }}
                        >
                          {selectedTable && sortFavoritesFirst(selectedTable.items)
                            .filter((i) => treatmentOptionLabel(i).toLowerCase().includes(treatmentSearch.toLowerCase()))
                            .map((i) => (
                              <li key={i.id}>
                                <button
                                  type="button"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => {
                                    setTreatmentId(i.id);
                                    setTreatmentSearch(treatmentOptionLabel(i));
                                    setPrice(formatMoneyDisplay(i.price));
                                    setShowTreatmentSuggestions(false);
                                  }}
                                  style={{
                                    display: "block",
                                    width: "100%",
                                    textAlign: "left",
                                    padding: "8px 10px",
                                    background: "none",
                                    border: "none",
                                    cursor: "pointer",
                                    borderRadius: 6,
                                    fontSize: 13.5,
                                  }}
                                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-sunken)")}
                                  onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                                >
                                  {treatmentOptionLabel(i)}
                                </button>
                              </li>
                            ))}
                          {treatmentSearch.trim().length > 0 && (
                            <li key="custom">
                              <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                  setTreatmentId(CUSTOM_TREATMENT_VALUE);
                                  setCustomName(treatmentSearch.trim());
                                  setPrice("");
                                  setShowTreatmentSuggestions(false);
                                }}
                                style={{
                                  display: "block",
                                  width: "100%",
                                  textAlign: "left",
                                  padding: "8px 10px",
                                  background: "none",
                                  border: "none",
                                  cursor: "pointer",
                                  borderRadius: 6,
                                  fontSize: 13.5,
                                  color: "var(--brand)",
                                  fontWeight: 600,
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--brand-tint)")}
                                onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                              >
                                + Tratamento avulso: "{treatmentSearch}"
                              </button>
                            </li>
                          )}
                        </ul>
                      )}
                    </div>

                    <div className={styles.field}>
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
                  </div>
                </div>

                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <p className={styles.fgroupLabel} style={{ margin: 0 }}>
                      Evoluções
                    </p>
                    <button type="button" onClick={openAddEvolution} className={`${styles.btn} ${styles.btnGhost}`}>
                      + Nova evolução
                    </button>
                  </div>

                  {loadingEvolutions ? (
                    <p style={{ color: "var(--ink-soft)", fontSize: 13.5 }}>Carregando…</p>
                  ) : evolutions.length === 0 ? (
                    <p style={{ color: "var(--ink-soft)", fontSize: 13.5 }}>Nenhuma evolução registrada ainda.</p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {evolutions.map((e) => {
                        const isLong = e.text.length > EVOLUTION_TRUNCATE_LENGTH;
                        const isExpanded = expandedEvolutionIds.includes(e.id);
                        const displayText = isLong && !isExpanded ? `${e.text.slice(0, EVOLUTION_TRUNCATE_LENGTH).trimEnd()}…` : e.text;
                        return (
                          <div key={e.id} className={tp.evolutionCard}>
                            <div className={tp.evolutionHeader}>
                              <span className={tp.evolutionDate}>
                                {formatBRDate(`${e.evolution_date}T12:00:00-03:00`)} · {formatBRTime(e.created_at)}
                              </span>
                              <div style={{ display: "flex", gap: 10 }}>
                                <button
                                  type="button"
                                  onClick={() => openEditEvolution(e)}
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
                            <p className={tp.evolutionText}>
                              {displayText}
                              {isLong && (
                                <button
                                  type="button"
                                  onClick={() => toggleExpanded(e.id)}
                                  style={{ border: "none", background: "none", color: "var(--brand)", cursor: "pointer", fontSize: 12.5, fontWeight: 600, marginLeft: 6, padding: 0 }}
                                >
                                  {isExpanded ? "ver menos" : "ver mais"}
                                </button>
                              )}
                            </p>
                            {e.image_keys.length > 0 && (
                              <div className={tp.evolutionImages}>
                                {e.image_keys.map((key, i) => {
                                  const caption = e.image_descriptions?.[i] || e.image_names?.[i] || "";
                                  const fileKey = key.split("/").pop();
                                  return (
                                    <button
                                      key={key}
                                      type="button"
                                      className={tp.evolutionThumb}
                                      style={{ border: "none", padding: 0, cursor: "pointer" }}
                                      title={caption || undefined}
                                      onClick={() => {
                                        setLightboxEvolutionId(e.id);
                                        setLightboxIndex(i);
                                      }}
                                    >
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img src={`/api/clinics/${clinicId}/treatment-evolutions/${e.id}/images/${fileKey}`} alt={caption} />
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <EvolutionFormModal
              open={evolutionModalOpen}
              onClose={() => setEvolutionModalOpen(false)}
              onSave={handleSaveEvolution}
              saving={savingEvolution}
              clinicId={clinicId}
              initial={evolutionModalInitial}
            />

            <ImageLightbox
              open={lightboxEvolutionId !== null}
              onClose={() => setLightboxEvolutionId(null)}
              images={(() => {
                const evo = evolutions.find((e) => e.id === lightboxEvolutionId);
                return (evo?.image_keys ?? []).map((key, i) => ({
                  url: `/api/clinics/${clinicId}/treatment-evolutions/${lightboxEvolutionId}/images/${key.split("/").pop()}`,
                  alt: evo?.image_descriptions?.[i] || evo?.image_names?.[i] || undefined,
                }));
              })()}
              index={lightboxIndex}
              onIndexChange={setLightboxIndex}
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
