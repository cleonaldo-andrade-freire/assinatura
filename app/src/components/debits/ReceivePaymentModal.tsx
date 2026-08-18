"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useEscapeToClose } from "@/lib/useEscapeToClose";
import { formatMoneyDisplay, formatMoneyInput, parseMoneyInput } from "@/lib/money";
import { PAYMENT_METHODS } from "@/lib/paymentMethods";
import type { TreatmentDebit } from "@/lib/database.types";
import uiStyles from "@/components/ui/ui.module.css";
import styles from "@/styles/shell.module.css";

function formatMoney(value: number): string {
  return `R$ ${formatMoneyDisplay(value)}`;
}

/**
 * Recebimento de pagamento — um ou mais débitos selecionados. Com mais de
 * um, o valor fica travado no total (pagamento parcial só faz sentido pra
 * um débito por vez, ver a rota receive-payment).
 */
export function ReceivePaymentModal({
  open,
  onClose,
  debits,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  debits: TreatmentDebit[];
  onConfirm: (paymentMethod: string, receivedAmount: number) => Promise<void> | void;
}) {
  const total = debits.reduce((sum, d) => sum + d.amount, 0);
  const canPartial = debits.length === 1;

  const [paymentMethod, setPaymentMethod] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  useEscapeToClose(onClose, open);

  useEffect(() => {
    if (!open) return;
    setPaymentMethod("");
    setAmount(formatMoneyDisplay(total));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, debits]);

  if (!open || typeof document === "undefined") return null;

  const receivedAmount = parseMoneyInput(amount);
  const isPartial = receivedAmount > 0 && receivedAmount < total;
  const remainder = Math.max(0, total - receivedAmount);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!paymentMethod || receivedAmount <= 0) return;
    setSaving(true);
    try {
      await onConfirm(paymentMethod, receivedAmount);
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className={uiStyles.overlay} onClick={onClose}>
      <div className={uiStyles.dialog} style={{ maxWidth: 480 }} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
          <h3 className={uiStyles.dialogTitle}>Receber pagamento</h3>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 14 }}>
          {debits.map((d) => (
            <div key={d.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--ink-soft)" }}>
              <span>{d.description}</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatMoney(d.amount)}</span>
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
              <label className={styles.label}>Valor recebido*</label>
              <input
                type="text"
                inputMode="numeric"
                className={styles.input}
                value={amount}
                onChange={(e) => setAmount(formatMoneyInput(e.target.value))}
                disabled={!canPartial}
                required
              />
            </div>
          </div>

          {!canPartial && (
            <p style={{ fontSize: 12, color: "var(--ink-faint)", margin: "-6px 0 10px" }}>
              Pagamento parcial só é permitido com um débito por vez — com vários selecionados, o valor recebido precisa cobrir o total.
            </p>
          )}
          {canPartial && isPartial && (
            <p style={{ fontSize: 12.5, color: "var(--warn)", margin: "-6px 0 10px" }}>
              Pagamento parcial — fica registrado como pago {formatMoney(receivedAmount)} e um novo débito de {formatMoney(remainder)} entra em aberto.
            </p>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
            <button type="button" disabled={saving} onClick={onClose} className={`${styles.btn} ${styles.btnGhost}`}>
              Cancelar
            </button>
            <button type="submit" disabled={saving || !paymentMethod || receivedAmount <= 0} className={`${styles.btn} ${styles.btnPrimary}`}>
              {saving ? "Salvando…" : "Confirmar recebimento"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
