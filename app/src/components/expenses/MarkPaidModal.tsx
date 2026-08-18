"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useEscapeToClose } from "@/lib/useEscapeToClose";
import { formatMoneyDisplay, formatMoneyInput, parseMoneyInput } from "@/lib/money";
import { brDateOnly } from "@/lib/date";
import { PAYMENT_METHODS } from "@/lib/paymentMethods";
import { ReceiptPickerModal } from "@/components/expenses/ReceiptPickerModal";
import type { Expense } from "@/lib/database.types";
import uiStyles from "@/components/ui/ui.module.css";
import styles from "@/styles/shell.module.css";
import ex from "./expenses.module.css";

function formatMoney(value: number): string {
  return `R$ ${formatMoneyDisplay(value)}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Marcar como pago — sem pagamento parcial (diferente de ReceivePaymentModal),
 * mas o valor lançado (na criação avulsa, ou pela estimativa do molde
 * recorrente) pode ser corrigido aqui pro valor real cobrado, comum em
 * despesa variável (conta de luz, água etc.).
 */
export function MarkPaidModal({
  open,
  onClose,
  expenses,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  expenses: Expense[];
  onConfirm: (paymentMethod: string, paidAt: string, amount: number | null, receiptFile: File | null) => Promise<void> | void;
}) {
  const total = expenses.reduce((sum, e) => sum + e.amount, 0);
  // Valor e comprovante só fazem sentido com UMA despesa por vez — com
  // várias selecionadas não dá pra saber a qual conta cada correção/recibo
  // pertence.
  const isSingleExpense = expenses.length === 1;

  const [paymentMethod, setPaymentMethod] = useState("");
  const [paidAt, setPaidAt] = useState("");
  const [amount, setAmount] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [pickingReceipt, setPickingReceipt] = useState(false);
  const [saving, setSaving] = useState(false);

  useEscapeToClose(onClose, open && !pickingReceipt);

  useEffect(() => {
    if (!open) return;
    setPaymentMethod("");
    setPaidAt(brDateOnly());
    setAmount(expenses.length === 1 ? formatMoneyDisplay(expenses[0].amount) : "");
    setReceiptFile(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, expenses]);

  if (!open || typeof document === "undefined") return null;

  const parsedAmount = parseMoneyInput(amount);
  const amountValid = !isSingleExpense || parsedAmount > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!paymentMethod || !paidAt || !amountValid) return;
    setSaving(true);
    try {
      await onConfirm(paymentMethod, paidAt, isSingleExpense ? parsedAmount : null, isSingleExpense ? receiptFile : null);
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className={uiStyles.overlay} onClick={onClose}>
      <div className={uiStyles.dialog} style={{ maxWidth: 480 }} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
          <h3 className={uiStyles.dialogTitle}>Marcar como pago</h3>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 14 }}>
          {expenses.map((e) => (
            <div key={e.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--ink-soft)" }}>
              <span>{e.description}</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatMoney(e.amount)}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 700, paddingTop: 6, borderTop: "1px solid var(--line)" }}>
            <span>Total</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatMoney(total)}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className={styles.formRow}>
            <div className={styles.field}>
              <label className={styles.label}>Meio de pagamento*</label>
              <select className={styles.select} value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} required>
                <option value="">Selecione…</option>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Data do pagamento*</label>
              <input type="date" className={styles.input} value={paidAt} onChange={(e) => setPaidAt(e.target.value)} required />
            </div>
          </div>

          {isSingleExpense ? (
            <div className={styles.field} style={{ marginTop: 14, maxWidth: 160 }}>
              <label className={styles.label}>Valor pago*</label>
              <input
                type="text"
                inputMode="numeric"
                className={styles.input}
                value={amount}
                onChange={(e) => setAmount(formatMoneyInput(e.target.value))}
                required
              />
              {parsedAmount > 0 && parsedAmount !== expenses[0].amount && (
                <p style={{ fontSize: 12, color: "var(--warn)", margin: "6px 0 0" }}>
                  Diferente do valor lançado ({formatMoney(expenses[0].amount)}) — a despesa é atualizada pro valor pago.
                </p>
              )}
            </div>
          ) : (
            <p style={{ fontSize: 12, color: "var(--ink-faint)", margin: "14px 0 0" }}>
              Pra corrigir o valor ou anexar comprovante, marque uma despesa por vez.
            </p>
          )}

          {isSingleExpense && (
            <div className={styles.field} style={{ marginTop: 14 }}>
              <label className={styles.label}>Comprovante</label>
              {receiptFile ? (
                <div className={ex.filePickedRow}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{receiptFile.name}</span>
                  <span style={{ color: "var(--ink-faint)", flexShrink: 0 }}>{formatFileSize(receiptFile.size)}</span>
                  <button type="button" onClick={() => setReceiptFile(null)} className={ex.filePickedRemove} aria-label="Remover" title="Remover">
                    ×
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => setPickingReceipt(true)} className={`${styles.btn} ${styles.btnGhost}`}>
                  + Anexar comprovante
                </button>
              )}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
            <button type="button" disabled={saving} onClick={onClose} className={`${styles.btn} ${styles.btnGhost}`}>
              Cancelar
            </button>
            <button type="submit" disabled={saving || !paymentMethod || !paidAt || !amountValid} className={`${styles.btn} ${styles.btnPrimary}`}>
              {saving ? "Salvando…" : "Confirmar pagamento"}
            </button>
          </div>
        </form>
      </div>
      <ReceiptPickerModal open={pickingReceipt} onClose={() => setPickingReceipt(false)} onPicked={setReceiptFile} />
    </div>,
    document.body
  );
}
