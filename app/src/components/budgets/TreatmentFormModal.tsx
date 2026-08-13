"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ToothRegionSelect } from "@/components/budgets/ToothRegionSelect";
import { formatMoneyDisplay, formatMoneyInput, parseMoneyInput } from "@/lib/money";
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
  const [price, setPrice] = useState("");
  const [toothSelection, setToothSelection] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setPriceTableId(initial.priceTableId ?? "");
      setTreatmentId(initial.priceTableItemId ?? (initial.priceTableId ? CUSTOM_TREATMENT_VALUE : ""));
      setCustomName(initial.priceTableItemId ? "" : initial.treatmentName);
      setPrice(formatMoneyDisplay(initial.price));
      setToothSelection(initial.toothRegion ? [initial.toothRegion] : []);
    } else {
      setPriceTableId("");
      setTreatmentId("");
      setCustomName("");
      setPrice("");
      setToothSelection([]);
    }
  }, [open, initial]);

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
          <button type="button" className={uiStyles.toastClose} onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14, paddingRight: 6 }}>
          <div className={styles.formRow}>
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
            <div className={styles.field} style={{ width: 140 }}>
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

          {/* Sozinho na própria linha, de propósito — um select só mostra o
              texto que couber na própria largura; ao lado de outros campos
              (Plano/Valor) o nome do tratamento cortava. */}
          <div className={styles.field}>
            <label className={styles.label}>Tratamento*</label>
            <select
              className={styles.select}
              value={treatmentId}
              onChange={(e) => {
                const v = e.target.value;
                setTreatmentId(v);
                if (v === CUSTOM_TREATMENT_VALUE) {
                  setPrice("");
                } else {
                  const item = selectedTable?.items.find((i) => i.id === v);
                  setPrice(item ? formatMoneyDisplay(item.price) : "");
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
            <div className={styles.field}>
              <label className={styles.label}>Nome do tratamento*</label>
              <input type="text" className={styles.input} value={customName} onChange={(e) => setCustomName(e.target.value)} />
            </div>
          )}

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
