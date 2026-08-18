"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ToothRegionSelect } from "@/components/budgets/ToothRegionSelect";
import { formatMoneyDisplay, formatMoneyInput, parseMoneyInput } from "@/lib/money";
import { sortFavoritesFirst, treatmentOptionLabel } from "@/lib/priceTables";
import type { PriceTable, PriceTableItem } from "@/lib/database.types";
import uiStyles from "@/components/ui/ui.module.css";
import styles from "@/styles/shell.module.css";

const CUSTOM_TREATMENT_VALUE = "__custom__";

interface CatalogTable extends PriceTable {
  items: PriceTableItem[];
}

export interface TreatmentFormValues {
  priceTableId: string | null;
  priceTableItemId: string | null;
  priceTableName: string | null;
  treatmentName: string;
  toothRegion: string;
  price: number;
}

/**
 * Modal dedicado pra adicionar/editar UMA linha de tratamento do orçamento
 * — aberto por cima do modal "Novo orçamento" (nested). Separar isso do
 * formulário principal deixa o orçamento em si só com a lista + totais
 * (menos poluído) e, de brinde, permite editar uma linha já adicionada em
 * vez de só poder removê-la e recomeçar.
 */
export function TreatmentFormModal({
  open,
  onClose,
  onSave,
  catalog,
  loadingCatalog,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  /** Uma entrada por dente/região marcado (ou uma só, sem dente, se nenhum
   * foi marcado) — mesmo tratamento em vários dentes vira uma linha cada,
   * com o valor cheio em cada uma (não dividido). */
  onSave: (values: TreatmentFormValues[]) => void;
  catalog: CatalogTable[];
  loadingCatalog: boolean;
  /** Presente = editando uma linha existente; null = adicionando uma nova. */
  initial: TreatmentFormValues | null;
}) {
  const [priceTableId, setPriceTableId] = useState("");
  const [treatmentId, setTreatmentId] = useState("");
  const [customName, setCustomName] = useState("");
  const [treatmentSearch, setTreatmentSearch] = useState("");
  const [showTreatmentSuggestions, setShowTreatmentSuggestions] = useState(false);
  const [price, setPrice] = useState("");
  const [toothSelection, setToothSelection] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setPriceTableId(initial.priceTableId ?? "");
      setTreatmentId(initial.priceTableItemId ?? (initial.priceTableId ? CUSTOM_TREATMENT_VALUE : ""));
      setCustomName(initial.priceTableItemId ? "" : initial.treatmentName);
      setTreatmentSearch(initial.treatmentName);
      setPrice(formatMoneyDisplay(initial.price));
      setToothSelection(initial.toothRegion ? [initial.toothRegion] : []);
    } else {
      setPriceTableId("");
      setTreatmentId("");
      setCustomName("");
      setTreatmentSearch("");
      setPrice("");
      setToothSelection([]);
    }
  }, [open, initial]);

  // Tabela padrão já vem selecionada (só ao adicionar, não ao editar) —
  // separado do reset acima de propósito: o catálogo pode chegar DEPOIS do
  // modal já estar aberto (corrida com o fetch), e isso não pode apagar
  // nada que o usuário já tenha escolhido enquanto esperava.
  useEffect(() => {
    if (!open || initial || priceTableId) return;
    const defaultTable = catalog.find((t) => t.is_default);
    if (defaultTable) setPriceTableId(defaultTable.id);
  }, [open, initial, catalog, priceTableId]);

  const selectedTable = catalog.find((t) => t.id === priceTableId);
  const isCustomTreatment = treatmentId === CUSTOM_TREATMENT_VALUE;

  function handleSave() {
    const treatmentName = isCustomTreatment ? customName.trim() : selectedTable?.items.find((i) => i.id === treatmentId)?.name ?? "";
    if (!treatmentName || !price) return;
    const base = {
      priceTableId: priceTableId || null,
      priceTableItemId: isCustomTreatment ? null : treatmentId || null,
      priceTableName: selectedTable?.name ?? null,
      treatmentName,
      price: parseMoneyInput(price),
    };
    const regions = toothSelection.length > 0 ? toothSelection : [""];
    onSave(regions.map((toothRegion) => ({ ...base, toothRegion })));
  }

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    // z-index maior que o overlay padrão (200) — abre por cima do modal
    // "Novo orçamento", que continua aberto atrás. stopPropagation no clique
    // do fundo evita que o clique "vaze" pro overlay do modal de trás (React
    // propaga eventos de portal pela árvore de componentes, não pelo DOM).
    <div className={uiStyles.overlay} style={{ zIndex: 260 }} onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div
        className={`${uiStyles.dialog} ${uiStyles.dialogExtraWide}`}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14, flexShrink: 0 }}>
          <h3 className={uiStyles.dialogTitle}>{initial ? "Editar tratamento" : "Adicionar tratamento"}</h3>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14, paddingRight: 6 }}>
          <div className={styles.formRow} style={{ gridTemplateColumns: "140px 1fr 110px", alignItems: "flex-start" }}>
            <div className={styles.field}>
              <label className={styles.label}>Plano*</label>
              <select
                className={styles.select}
                value={priceTableId}
                onChange={(e) => {
                  setPriceTableId(e.target.value);
                  setTreatmentId("");
                  setPrice("");
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
                  // Clear selected id when typing so it's fresh
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
                placeholder="0,00"
              />
            </div>
          </div>

          <ToothRegionSelect value={toothSelection} onChange={setToothSelection} />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 14, marginTop: 10, borderTop: "1px solid var(--line-soft)", flexShrink: 0 }}>
          <button type="button" onClick={onClose} className={`${styles.btn} ${styles.btnGhost}`}>
            Cancelar
          </button>
          <button type="button" onClick={handleSave} className={`${styles.btn} ${styles.btnPrimary}`}>
            {initial ? "Salvar" : toothSelection.length > 1 ? `Adicionar ${toothSelection.length} tratamentos` : "Adicionar"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
