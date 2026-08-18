"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { TreatmentFormModal, type TreatmentFormValues } from "@/components/budgets/TreatmentFormModal";
import { ToastStack, useToasts } from "@/components/ui/Toast";
import { brDateOnly } from "@/lib/date";
import { formatMoneyDisplay, formatMoneyInput, parseMoneyInput } from "@/lib/money";
import { PAYMENT_METHODS } from "@/lib/paymentMethods";
import type { PriceTable, PriceTableItem } from "@/lib/database.types";
import uiStyles from "@/components/ui/ui.module.css";
import styles from "@/styles/shell.module.css";
import nb from "./newBudget.module.css";

// Só esses dois meios fazem sentido parcelar — os outros são à vista por natureza.
const PARCELABLE_METHODS = new Set(["Cartão de crédito", "Boleto"]);

interface CatalogTable extends PriceTable {
  items: PriceTableItem[];
}

interface DraftItem extends TreatmentFormValues {
  key: string;
  selected: boolean;
}

function formatMoney(value: number): string {
  return `R$ ${formatMoneyDisplay(value)}`;
}

function installmentOptions(total: number, max = 12): { count: number; label: string }[] {
  if (total <= 0) return [{ count: 1, label: `1x de ${formatMoney(0)}` }];
  return Array.from({ length: max }, (_, i) => i + 1).map((n) => ({
    count: n,
    label: `${n}x de ${formatMoney(total / n)}`,
  }));
}

/**
 * Modal "Novo orçamento" — só descrição/data, a lista de tratamentos já
 * adicionados (com total/desconto/parcelamento) e observações. Adicionar ou
 * editar uma linha de tratamento abre `TreatmentFormModal` por cima (nested)
 * — mantém este modal enxuto em vez de misturar os dois formulários num só.
 */
export function NewBudgetModal({
  open,
  onClose,
  clinicId,
  patientId,
  patientName,
  defaultResponsibleName,
}: {
  open: boolean;
  onClose: () => void;
  clinicId: string;
  patientId: string;
  patientName: string;
  defaultResponsibleName: string;
}) {
  const router = useRouter();
  const { toasts, push, dismiss } = useToasts();

  const [catalog, setCatalog] = useState<CatalogTable[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  const [description, setDescription] = useState(`Plano tratamento de ${patientName}`);
  const [budgetDate, setBudgetDate] = useState(brDateOnly());

  const [items, setItems] = useState<DraftItem[]>([]);
  const [treatmentModalOpen, setTreatmentModalOpen] = useState(false);
  const [editingItemKey, setEditingItemKey] = useState<string | null>(null);

  const [discountType, setDiscountType] = useState<"fixed" | "percent">("fixed");
  const [discountValue, setDiscountValue] = useState("");

  const [parcelar, setParcelar] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("");
  const [installments, setInstallments] = useState(1);

  const [adicionarEntrada, setAdicionarEntrada] = useState(false);
  const [downPaymentMethod, setDownPaymentMethod] = useState("");
  const [downPaymentValue, setDownPaymentValue] = useState("");
  const [balanceInstallments, setBalanceInstallments] = useState(1);

  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState<"draft" | "approve" | null>(null);

  const [activeTab, setActiveTab] = useState<"dados" | "valores">("dados");

  const canInstallment = PARCELABLE_METHODS.has(paymentMethod);

  // Meio de pagamento decide se parcelamento é uma opção — trocar pra um
  // meio à vista limpa o que só fazia sentido no parcelado.
  useEffect(() => {
    if (canInstallment) return;
    setParcelar(false);
    setAdicionarEntrada(false);
  }, [canInstallment]);

  useEffect(() => {
    if (!open) return;
    setLoadingCatalog(true);
    fetch(`/api/clinics/${clinicId}/price-tables/catalog`)
      .then((res) => res.json())
      .then((data) => setCatalog(data.priceTables ?? []))
      .catch(() => push("Falha ao carregar tabelas de tratamento."))
      .finally(() => setLoadingCatalog(false));
  }, [open, clinicId, push]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      // Se o modal de tratamento (nested) está aberto, Esc fecha só ele —
      // sem isso, os dois modais fechariam juntos e o orçamento perderia
      // tudo por causa de um Esc que era só pra cancelar a linha.
      if (treatmentModalOpen) {
        setTreatmentModalOpen(false);
        return;
      }
      onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, treatmentModalOpen]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const totalValue = items.reduce((sum, i) => sum + i.price, 0);
  const selectedValue = items.filter((i) => i.selected).reduce((sum, i) => sum + i.price, 0);
  const discountAmount = useMemo(() => {
    const v = parseMoneyInput(discountValue);
    return discountType === "percent" ? (selectedValue * v) / 100 : v;
  }, [discountType, discountValue, selectedValue]);
  const total = Math.max(0, selectedValue - discountAmount);

  const downPayment = adicionarEntrada ? parseMoneyInput(downPaymentValue) : 0;
  const remainingBalance = Math.max(0, total - downPayment);

  const editingItem = editingItemKey ? items.find((i) => i.key === editingItemKey) ?? null : null;

  function resetForm() {
    setDescription(`Plano tratamento de ${patientName}`);
    setBudgetDate(brDateOnly());
    setItems([]);
    setTreatmentModalOpen(false);
    setEditingItemKey(null);
    setDiscountType("fixed");
    setDiscountValue("");
    setParcelar(false);
    setPaymentMethod("");
    setInstallments(1);
    setAdicionarEntrada(false);
    setDownPaymentMethod("");
    setDownPaymentValue("");
    setBalanceInstallments(1);
    setNotes("");
    setActiveTab("dados");
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  function openAddTreatment() {
    setEditingItemKey(null);
    setTreatmentModalOpen(true);
  }

  function openEditTreatment(key: string) {
    setEditingItemKey(key);
    setTreatmentModalOpen(true);
  }

  function handleTreatmentSave(valuesList: TreatmentFormValues[]) {
    const newItems: DraftItem[] = valuesList.map((v) => ({ ...v, key: crypto.randomUUID(), selected: true }));
    if (editingItemKey) {
      // Substitui a linha editada pelas novas — se a seleção de
      // dentes/região mudou pra mais de um, uma linha vira várias, cada
      // uma no lugar que a original ocupava na lista.
      setItems((prev) => {
        const idx = prev.findIndex((i) => i.key === editingItemKey);
        if (idx === -1) return [...prev, ...newItems];
        return [...prev.slice(0, idx), ...newItems, ...prev.slice(idx + 1)];
      });
    } else {
      setItems((prev) => [...prev, ...newItems]);
    }
    setTreatmentModalOpen(false);
    setEditingItemKey(null);
  }

  function toggleItemSelected(key: string) {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, selected: !i.selected } : i)));
  }

  function removeItem(key: string) {
    setItems((prev) => prev.filter((i) => i.key !== key));
  }

  async function handleSave(status: "em_aberto" | "aprovado") {
    if (!description.trim() || !budgetDate) {
      push("Preencha descrição e data.");
      return;
    }
    if (items.length === 0) {
      push("Adicione pelo menos um tratamento.");
      return;
    }
    setSaving(status === "aprovado" ? "approve" : "draft");
    try {
      const res = await fetch(`/api/clinics/${clinicId}/patients/${patientId}/budgets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: description.trim(),
          responsible_name: defaultResponsibleName,
          budget_date: budgetDate,
          status,
          discount_type: discountType,
          discount_value: parseMoneyInput(discountValue),
          installments: adicionarEntrada ? balanceInstallments : parcelar ? installments : 1,
          payment_method: (adicionarEntrada ? downPaymentMethod : paymentMethod) || null,
          down_payment_value: adicionarEntrada ? downPayment : null,
          down_payment_method: adicionarEntrada ? downPaymentMethod || null : null,
          notes: notes.trim() || undefined,
          items: items.map((i) => ({
            price_table_item_id: i.priceTableItemId,
            price_table_name: i.priceTableName,
            treatment_name: i.treatmentName,
            tooth_region: i.toothRegion || null,
            price: i.price,
            dentist_name: defaultResponsibleName,
            selected: i.selected,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        push(data.message || data.error || "Falha ao salvar o orçamento.");
        return;
      }
      push("Orçamento salvo.", "success");
      handleClose();
      router.refresh();
    } finally {
      setSaving(null);
    }
  }

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className={uiStyles.overlay} onClick={handleClose}>
      <div className={`${uiStyles.dialog} ${uiStyles.dialogWide}`} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 10, flexShrink: 0 }}>
          <h3 className={uiStyles.dialogTitle}>Novo orçamento</h3>
        </div>

        <div className={nb.tabs}>
          <button
            type="button"
            className={`${nb.tabBtn} ${activeTab === "dados" ? nb.tabBtnActive : ""}`}
            onClick={() => setActiveTab("dados")}
          >
            Tratamentos
          </button>
          <button
            type="button"
            className={`${nb.tabBtn} ${activeTab === "valores" ? nb.tabBtnActive : ""}`}
            onClick={() => setActiveTab("valores")}
          >
            Valores e Pagamento
          </button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16, paddingRight: 6 }}>
          {activeTab === "dados" && (
            <>
              <div className={nb.section}>
            <p className={nb.sectionTitle}>Dados do orçamento</p>
            <div className={styles.formRow} style={{ marginBottom: 0 }}>
              <div className={styles.field} style={{ flex: 2 }}>
                <label className={styles.label}>Descrição*</label>
                <input type="text" className={styles.input} value={description} onChange={(e) => setDescription(e.target.value)} required />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Data*</label>
                <input type="date" className={styles.input} value={budgetDate} onChange={(e) => setBudgetDate(e.target.value)} required />
              </div>
            </div>
          </div>

          <div className={nb.section}>
            <p className={nb.sectionTitle}>Tratamentos</p>

            {items.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
                {items.map((item) => (
                  <div key={item.key} className={nb.itemRow}>
                    <input
                      type="checkbox"
                      checked={item.selected}
                      onChange={() => toggleItemSelected(item.key)}
                      title={item.selected ? "Incluído no total" : "Fora do total"}
                      style={{ width: 18, height: 18, accentColor: "var(--brand)", flexShrink: 0 }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <button type="button" className={nb.itemName} onClick={() => openEditTreatment(item.key)}>
                        {item.toothRegion ? `${item.toothRegion} — ` : ""}
                        {item.treatmentName}
                      </button>
                      {item.priceTableName && <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>{item.priceTableName}</div>}
                    </div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{formatMoney(item.price)}</div>
                    <button type="button" onClick={() => removeItem(item.key)} className={nb.removeBtn} aria-label="Remover tratamento" title="Remover">
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

              <button type="button" onClick={openAddTreatment} className={nb.addTreatmentBtn}>
                + Adicionar tratamento
              </button>
            </div>
          </>
        )}

        {activeTab === "valores" && (
          <div className={nb.section}>
            <p className={nb.sectionTitle}>Valores e forma de pagamento</p>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
              <div style={{ display: "flex", justifyContent: "space-between", width: "100%", maxWidth: 320, fontSize: 13.5 }}>
                <span style={{ color: "var(--ink-soft)" }}>Valor total orçamento</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatMoney(totalValue)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", width: "100%", maxWidth: 320, fontSize: 13.5 }}>
                <span style={{ color: "var(--ink-soft)" }}>Valor selecionado</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatMoney(selectedValue)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", maxWidth: 320, gap: 8 }}>
                <span style={{ color: "var(--ink-soft)", fontSize: 13.5 }}>Desconto</span>
                <div style={{ display: "flex", gap: 6 }}>
                  <select className={styles.select} style={{ width: 68 }} value={discountType} onChange={(e) => setDiscountType(e.target.value as "fixed" | "percent")}>
                    <option value="fixed">R$</option>
                    <option value="percent">%</option>
                  </select>
                  <input
                    type="text"
                    inputMode="numeric"
                    className={styles.input}
                    style={{ width: 100 }}
                    value={discountValue}
                    onChange={(e) => setDiscountValue(discountType === "percent" ? e.target.value.replace(/[^\d,]/g, "") : formatMoneyInput(e.target.value))}
                    placeholder="0,00"
                  />
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", width: "100%", maxWidth: 320, fontSize: 15, fontWeight: 700, paddingTop: 8, borderTop: "1px solid var(--line)" }}>
                <span>Total</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatMoney(total)}</span>
              </div>
            </div>

            <hr className={nb.sectionDivider} />

            <div className={styles.field} style={{ maxWidth: 260, marginBottom: 0 }}>
              <label className={styles.label}>Meio de pagamento*</label>
              <select className={styles.select} value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                <option value="">Selecione…</option>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            {canInstallment && (
              <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 14 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={parcelar}
                    onChange={(e) => {
                      setParcelar(e.target.checked);
                      if (!e.target.checked) setAdicionarEntrada(false);
                    }}
                    style={{ width: 20, height: 20, accentColor: "var(--brand)" }}
                  />
                  <span style={{ fontSize: 13.5 }}>Parcelar orçamento</span>
                </label>

                {parcelar && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={adicionarEntrada}
                        onChange={(e) => setAdicionarEntrada(e.target.checked)}
                        style={{ width: 20, height: 20, accentColor: "var(--brand)" }}
                      />
                      <span style={{ fontSize: 13.5 }}>Adicionar entrada</span>
                    </label>

                    {!adicionarEntrada ? (
                      <div className={styles.field} style={{ maxWidth: 260, marginBottom: 0 }}>
                        <label className={styles.label}>Condições de pagamento*</label>
                        <select className={styles.select} value={installments} onChange={(e) => setInstallments(Number(e.target.value))}>
                          {installmentOptions(total).map((o) => (
                            <option key={o.count} value={o.count}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <>
                        <div className={styles.formRow}>
                          <div className={styles.field}>
                            <label className={styles.label}>Meio de pagamento da entrada</label>
                            <select className={styles.select} value={downPaymentMethod} onChange={(e) => setDownPaymentMethod(e.target.value)}>
                              <option value="">Selecione…</option>
                              {PAYMENT_METHODS.map((m) => (
                                <option key={m} value={m}>
                                  {m}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className={styles.field}>
                            <label className={styles.label}>Valor da entrada*</label>
                            <input
                              type="text"
                              inputMode="numeric"
                              className={styles.input}
                              value={downPaymentValue}
                              onChange={(e) => setDownPaymentValue(formatMoneyInput(e.target.value))}
                              placeholder="0,00"
                            />
                          </div>
                        </div>
                        <div style={{ fontSize: 13.5, fontWeight: 600 }}>Saldo restante ({paymentMethod}) — {formatMoney(remainingBalance)}</div>
                        <div className={styles.field} style={{ maxWidth: 260, marginBottom: 0 }}>
                          <label className={styles.label}>Condições de pagamento do saldo*</label>
                          <select className={styles.select} value={balanceInstallments} onChange={(e) => setBalanceInstallments(Number(e.target.value))}>
                            {installmentOptions(remainingBalance).map((o) => (
                              <option key={o.count} value={o.count}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            <hr className={nb.sectionDivider} />

              <div className={styles.field} style={{ marginBottom: 0 }}>
                <label className={styles.label}>Observações</label>
                <textarea className={styles.input} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 14, marginTop: 10, borderTop: "1px solid var(--line-soft)", flexShrink: 0 }}>
          <button type="button" onClick={handleClose} className={`${styles.btn} ${styles.btnGhost}`}>
            Fechar
          </button>
          <button type="button" disabled={saving !== null} onClick={() => handleSave("aprovado")} className={`${styles.btn} ${styles.btnGhost}`}>
            {saving === "approve" ? "Aprovando…" : "Aprovar"}
          </button>
          <button type="button" disabled={saving !== null} onClick={() => handleSave("em_aberto")} className={`${styles.btn} ${styles.btnPrimary}`}>
            {saving === "draft" ? "Salvando…" : "Salvar orçamento"}
          </button>
        </div>
      </div>

      <TreatmentFormModal
        open={treatmentModalOpen}
        onClose={() => {
          setTreatmentModalOpen(false);
          setEditingItemKey(null);
        }}
        onSave={handleTreatmentSave}
        catalog={catalog}
        loadingCatalog={loadingCatalog}
        initial={editingItem}
      />

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>,
    document.body
  );
}
