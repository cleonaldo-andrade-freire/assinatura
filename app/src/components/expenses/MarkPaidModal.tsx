"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useEscapeToClose } from "@/lib/useEscapeToClose";
import { formatMoneyDisplay } from "@/lib/money";
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
 * Marcar como pago — sem campo de valor (diferente de ReceivePaymentModal):
 * despesa não tem pagamento parcial, é um toggle pendente/pago só.
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
  onConfirm: (paymentMethod: string, paidAt: string, receiptFile: File | null) => Promise<void> | void;
}) {
  const total = expenses.reduce((sum, e) => sum + e.amount, 0);
  // Um comprovante só faz sentido anexado a UMA despesa — com várias
  // selecionadas de uma vez não dá pra saber qual recibo é de qual conta.
  const canAttachReceipt = expenses.length === 1;

  const [paymentMethod, setPaymentMethod] = useState("");
  const [paidAt, setPaidAt] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [pickingReceipt, setPickingReceipt] = useState(false);
  const [saving, setSaving] = useState(false);

  useEscapeToClose(onClose, open && !pickingReceipt);

  useEffect(() => {
    if (!open) return;
    setPaymentMethod("");
    setPaidAt(brDateOnly());
    setReceiptFile(null);
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!paymentMethod || !paidAt) return;
    setSaving(true);
    try {
      await onConfirm(paymentMethod, paidAt, canAttachReceipt ? receiptFile : null);
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className={uiStyles.overlay} onClick={onClose}>
      <div className={uiStyles.dialog} style={{ maxWidth: 480 }} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
          <h3 className={uiStyles.dialogTitle}>Marcar como pago</h3>
          <button type="button" className={uiStyles.toastClose} onClick={onClose} aria-label="Fechar">
            ×
          </button>
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

          {canAttachReceipt ? (
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
          ) : (
            <p style={{ fontSize: 12, color: "var(--ink-faint)", margin: "14px 0 0" }}>
              Pra anexar comprovante, marque uma despesa por vez — com várias selecionadas não dá pra saber de qual conta é o recibo.
            </p>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
            <button type="button" disabled={saving} onClick={onClose} className={`${styles.btn} ${styles.btnGhost}`}>
              Cancelar
            </button>
            <button type="submit" disabled={saving || !paymentMethod || !paidAt} className={`${styles.btn} ${styles.btnPrimary}`}>
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
