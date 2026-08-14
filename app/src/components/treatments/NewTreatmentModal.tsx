"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ToothRegionSelect } from "@/components/budgets/ToothRegionSelect";
import { ToastStack, useToasts } from "@/components/ui/Toast";
import { formatMoneyDisplay, formatMoneyInput, parseMoneyInput } from "@/lib/money";
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
  onCreated: (treatment: Treatment) => void;
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
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPriceTableId("");
    setTreatmentId("");
    setCustomName("");
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
      const res = await fetch(`/api/clinics/${clinicId}/patients/${patientId}/treatments`, {
        method: "POST",
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
        push("Falha ao criar. Tenta de novo.");
        return;
      }
      onCreated(data.treatment as Treatment);
      push("Tratamento adicionado.", "success");
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
              <input type="text" inputMode="numeric" className={styles.input} value={price} onChange={(e) => setPrice(formatMoneyInput(e.target.value))} placeholder="0,00" />
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

          <ToothRegionSelect value={toothSelection} onChange={setToothSelection} single />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 14, marginTop: 10, borderTop: "1px solid var(--line-soft)", flexShrink: 0 }}>
          <button type="button" disabled={saving} onClick={onClose} className={`${styles.btn} ${styles.btnGhost}`}>
            Cancelar
          </button>
          <button type="button" disabled={saving} onClick={handleSave} className={`${styles.btn} ${styles.btnPrimary}`}>
            {saving ? "Salvando…" : "Adicionar"}
          </button>
        </div>
      </div>
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>,
    document.body
  );
}
