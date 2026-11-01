"use client";

import { createPortal } from "react-dom";
import { useEscapeToClose } from "@/lib/useEscapeToClose";
import { formatMoneyDisplay } from "@/lib/money";
import { formatBRDateTime } from "@/lib/date";
import uiStyles from "@/components/ui/ui.module.css";
import styles from "@/styles/shell.module.css";

/** Um lançamento pago (receita ou despesa) — `date` é o `paid_at`. */
export type FinancialEntry = {
  id: string;
  date: string;
  description: string;
  /** Paciente/locatário (receita) ou categoria (despesa). */
  detail: string | null;
  paymentMethod: string | null;
  amount: number;
};

/** Extrato dos lançamentos de um card do Dashboard, em ordem cronológica (data da baixa). */
export function FinancialEntriesModal({
  open,
  onClose,
  title,
  entries,
  danger = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  entries: FinancialEntry[];
  danger?: boolean;
}) {
  useEscapeToClose(onClose, open);
  if (!open || typeof document === "undefined") return null;

  // Por timestamp, não string — débitos e locações podem vir com offsets diferentes.
  const sorted = [...entries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const total = sorted.reduce((sum, e) => sum + e.amount, 0);
  const amountColor = danger ? "var(--danger)" : "var(--ink)";

  return createPortal(
    <div className={uiStyles.overlay} onClick={onClose}>
      <div
        className={uiStyles.dialog}
        style={{ maxWidth: 600, maxHeight: "85vh", display: "flex", flexDirection: "column" }}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className={uiStyles.dialogTitle} style={{ marginBottom: 14 }}>
          {title}
        </h3>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
          {sorted.length === 0 ? (
            <div className={styles.emptyState}>Nenhum lançamento no período.</div>
          ) : (
            sorted.map((e) => (
              <div
                key={e.id}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderBottom: "1px solid var(--line)" }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>{e.description}</div>
                  <div style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 2 }}>
                    {[formatBRDateTime(e.date), e.detail, e.paymentMethod].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: amountColor, flexShrink: 0 }}>
                  R$ {formatMoneyDisplay(e.amount)}
                </div>
              </div>
            ))
          )}
        </div>

        {sorted.length > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 700, paddingTop: 10 }}>
            <span>
              Total ({sorted.length} lançamento{sorted.length === 1 ? "" : "s"})
            </span>
            <span style={{ fontVariantNumeric: "tabular-nums", color: amountColor }}>R$ {formatMoneyDisplay(total)}</span>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
          <button type="button" onClick={onClose} className={`${styles.btn} ${styles.btnGhost}`}>
            Fechar
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
