"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ToothRegionSelect } from "@/components/budgets/ToothRegionSelect";
import { ToastStack, useToasts } from "@/components/ui/Toast";
import { useEscapeToClose } from "@/lib/useEscapeToClose";
import { formatMoneyDisplay, formatMoneyInput, parseMoneyInput } from "@/lib/money";
import { sortFavoritesFirst, treatmentOptionLabel } from "@/lib/priceTables";
import type { PriceTable, PriceTableItem, Treatment } from "@/lib/database.types";
import uiStyles from "@/components/ui/ui.module.css";
import styles from "@/styles/shell.module.css";

const CUSTOM_TREATMENT_VALUE = "__custom__";

interface CatalogTable extends PriceTable {
  items: PriceTableItem[];
}

/**
 * Modal pra lançar um tratamento direto na ficha, sem passar por orçamento
 * — mesmos campos (Plano/Tratamento/Valor + odontograma) das outras telas
 * de tratamento do projeto, só que criando em vez de editando.
 */
export function NewTreatmentModal({
  open,
  onClose,
  clinicId,
  patientId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  clinicId: string;
  patientId: string;
  /** Uma chamada por dente/região marcado — mesmo tratamento em vários
   * dentes vira um lançamento cada, valor cheio em cada um (não dividido),
   * mesmo padrão do orçamento. */
  onCreated: (treatment: Treatment) => void;
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
  const [saving, setSaving] = useState(false);

  useEscapeToClose(onClose, open);

  useEffect(() => {
    if (!open) return;
    setPriceTableId("");
    setTreatmentId("");
    setCustomName("");
    setTreatmentSearch("");
    setPrice("");
    setToothSelection([]);
    setLoadingCatalog(true);
    fetch(`/api/clinics/${clinicId}/price-tables/catalog`)
      .then((res) => res.json())
      .then((data) => setCatalog(data.priceTables ?? []))
      .catch(() => push("Falha ao carregar tabelas de tratamento."))
      .finally(() => setLoadingCatalog(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Tabela padrão já vem selecionada, igual no orçamento.
  useEffect(() => {
    if (!open || priceTableId) return;
    const defaultTable = catalog.find((t) => t.is_default);
    if (defaultTable) setPriceTableId(defaultTable.id);
  }, [open, catalog, priceTableId]);

  if (!open || typeof document === "undefined") return null;

  const selectedTable = catalog.find((t) => t.id === priceTableId);
  const isCustomTreatment = treatmentId === CUSTOM_TREATMENT_VALUE;

  async function handleSave() {
    const treatmentName = isCustomTreatment ? customName.trim() : selectedTable?.items.find((i) => i.id === treatmentId)?.name ?? "";
    if (!treatmentName || !price) {
      push("Preencha tratamento e valor.");
      return;
    }
    setSaving(true);
    try {
      const regions = toothSelection.length > 0 ? toothSelection : [""];
      const results = await Promise.all(
        regions.map((toothRegion) =>
          fetch(`/api/clinics/${clinicId}/patients/${patientId}/treatments`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              treatment_name: treatmentName,
              tooth_region: toothRegion || null,
              price: parseMoneyInput(price),
              price_table_name: selectedTable?.name ?? null,
            }),
          }).then(async (res) => ({ ok: res.ok, data: await res.json() }))
        )
      );
      const failed = results.filter((r) => !r.ok).length;
      results.filter((r) => r.ok).forEach((r) => onCreated(r.data.treatment as Treatment));
      if (failed > 0) {
        push(failed === results.length ? "Falha ao criar. Tenta de novo." : `${failed} tratamento(s) não foram criados. Tenta de novo.`);
        if (failed === results.length) return;
      }
      push(results.length > 1 ? `${results.length - failed} tratamentos adicionados.` : "Tratamento adicionado.", "success");
      onClose();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className={uiStyles.overlay} onClick={onClose}>
      <div className={`${uiStyles.dialog} ${uiStyles.dialogExtraWide}`} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14, flexShrink: 0 }}>
          <h3 className={uiStyles.dialogTitle}>Novo tratamento</h3>
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
              <input type="text" inputMode="numeric" className={styles.input} value={price} onChange={(e) => setPrice(formatMoneyInput(e.target.value))} placeholder="0,00" />
            </div>
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
          <button type="button" disabled={saving} onClick={onClose} className={`${styles.btn} ${styles.btnGhost}`}>
            Cancelar
          </button>
          <button type="button" disabled={saving} onClick={handleSave} className={`${styles.btn} ${styles.btnPrimary}`}>
            {saving ? "Salvando…" : toothSelection.length > 1 ? `Adicionar ${toothSelection.length} tratamentos` : "Adicionar"}
          </button>
        </div>
      </div>
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>,
    document.body
  );
}
