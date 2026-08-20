"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useEscapeToClose } from "@/lib/useEscapeToClose";
import { formatMoneyDisplay } from "@/lib/money";
import type { Receipt, TreatmentDebit } from "@/lib/database.types";
import uiStyles from "@/components/ui/ui.module.css";
import styles from "@/styles/shell.module.css";

function formatMoney(value: number): string {
  return `R$ ${formatMoneyDisplay(value)}`;
}

/**
 * Emissão de recibo — junta os débitos pagos selecionados num só documento.
 * Depois de emitido, o modal troca pra uma tela de resultado (baixar PDF /
 * mandar por WhatsApp) em vez de fechar sozinho — igual ao fluxo de
 * orçamento, dá pra mandar na hora sem precisar reabrir nada.
 */
export function IssueReceiptModal({
  open,
  onClose,
  clinicId,
  debits,
  onIssued,
}: {
  open: boolean;
  onClose: () => void;
  clinicId: string;
  debits: TreatmentDebit[];
  onIssued: (receipt: Receipt) => void;
}) {
  const total = debits.reduce((sum, d) => sum + d.amount, 0);

  const [declaredIr, setDeclaredIr] = useState(false);
  const [saving, setSaving] = useState(false);
  const [issuedReceipt, setIssuedReceipt] = useState<Receipt | null>(null);
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);
  const [error, setError] = useState("");

  useEscapeToClose(onClose, open);

  useEffect(() => {
    if (!open) return;
    setDeclaredIr(false);
    setIssuedReceipt(null);
    setError("");
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  async function handleIssue() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/clinics/${clinicId}/receipts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ debit_ids: debits.map((d) => d.id), declared_ir: declaredIr }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Falha ao emitir o recibo. Tenta de novo.");
        return;
      }
      setIssuedReceipt(data.receipt as Receipt);
      onIssued(data.receipt as Receipt);
    } finally {
      setSaving(false);
    }
  }

  async function handleSendWhatsApp() {
    if (!issuedReceipt) return;
    setSendingWhatsApp(true);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/receipts/${issuedReceipt.id}/send-whatsapp`, { method: "POST" });
      const data = await res.json().catch(() => null);
      setError(res.ok ? "" : data?.message || "Falha ao enviar por WhatsApp.");
    } finally {
      setSendingWhatsApp(false);
    }
  }

  return createPortal(
    <div className={uiStyles.overlay} onClick={onClose}>
      <div className={uiStyles.dialog} style={{ maxWidth: 480 }} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
          <h3 className={uiStyles.dialogTitle}>{issuedReceipt ? "Recibo emitido" : "Emitir recibo"}</h3>
        </div>

        {issuedReceipt ? (
          <div>
            <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginBottom: 16 }}>
              Recibo de {formatMoney(issuedReceipt.total_amount)} pronto pra {issuedReceipt.patient_name}.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <a
                href={`/api/clinics/${clinicId}/receipts/${issuedReceipt.id}/pdf`}
                target="_blank"
                rel="noreferrer"
                className={`${styles.btn} ${styles.btnPrimary}`}
                style={{ textAlign: "center", textDecoration: "none" }}
              >
                📄 Baixar PDF
              </a>
              <button type="button" disabled={sendingWhatsApp} onClick={handleSendWhatsApp} className={`${styles.btn} ${styles.btnGhost}`}>
                {sendingWhatsApp ? "Enviando…" : "📲 Enviar por WhatsApp"}
              </button>
            </div>
            {error && <p style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 10 }}>{error}</p>}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <button type="button" onClick={onClose} className={`${styles.btn} ${styles.btnGhost}`}>
                Fechar
              </button>
            </div>
          </div>
        ) : (
          <div>
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

            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={declaredIr}
                onChange={(e) => setDeclaredIr(e.target.checked)}
                style={{ width: 20, height: 20, accentColor: "var(--brand)" }}
              />
              <span style={{ fontSize: 13.5 }}>Declarar no IR do paciente</span>
            </label>

            {error && <p style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 10 }}>{error}</p>}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
              <button type="button" disabled={saving} onClick={onClose} className={`${styles.btn} ${styles.btnGhost}`}>
                Cancelar
              </button>
              <button type="button" disabled={saving} onClick={handleIssue} className={`${styles.btn} ${styles.btnPrimary}`}>
                {saving ? "Emitindo…" : "Emitir recibo"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
