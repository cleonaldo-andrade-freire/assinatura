"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Pagination } from "@/components/ui/Pagination";
import { ToastStack, useToasts } from "@/components/ui/Toast";
import { ReceivePaymentModal } from "@/components/debits/ReceivePaymentModal";
import { IssueReceiptModal } from "@/components/debits/IssueReceiptModal";
import { formatMoneyDisplay } from "@/lib/money";
import { formatBRDateTime } from "@/lib/date";
import type { Receipt, TreatmentDebit } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";
import db from "./debits.module.css";

function formatMoney(value: number): string {
  return `R$ ${formatMoneyDisplay(value)}`;
}

export function DebitsPanel({
  clinicId,
  patientId,
  initialOpenDebits,
  openPage,
  openTotalPages,
  openCount,
  totalToReceive,
  initialPaidDebits,
  paidPage,
  paidTotalPages,
  paidCount,
  totalReceived,
}: {
  clinicId: string;
  patientId: string;
  initialOpenDebits: TreatmentDebit[];
  openPage: number;
  openTotalPages: number;
  openCount: number;
  totalToReceive: number;
  initialPaidDebits: TreatmentDebit[];
  paidPage: number;
  paidTotalPages: number;
  paidCount: number;
  totalReceived: number;
}) {
  const router = useRouter();

  // Funções criadas aqui dentro (não recebidas via prop) de propósito — ver
  // mesmo comentário em TreatmentsPanel.tsx (RSC não deixa passar função
  // pronta de Server pra Client Component).
  function openHrefFor(p: number) {
    const params = new URLSearchParams();
    params.set("dbPage", String(p));
    params.set("tab", "debitos");
    return `/dashboard/pacientes/${patientId}?${params.toString()}`;
  }
  function paidHrefFor(p: number) {
    const params = new URLSearchParams();
    params.set("dbPaidPage", String(p));
    params.set("tab", "debitos");
    return `/dashboard/pacientes/${patientId}?${params.toString()}`;
  }

  const [openDebits, setOpenDebits] = useState(initialOpenDebits);
  const [paidDebits, setPaidDebits] = useState(initialPaidDebits);
  useEffect(() => {
    setOpenDebits(initialOpenDebits);
    setSelectedOpen(new Set());
  }, [initialOpenDebits]);
  useEffect(() => {
    setPaidDebits(initialPaidDebits);
    setSelectedPaid(new Set());
  }, [initialPaidDebits]);

  const [selectedOpen, setSelectedOpen] = useState<Set<string>>(new Set());
  const [selectedPaid, setSelectedPaid] = useState<Set<string>>(new Set());
  const [receivingPayment, setReceivingPayment] = useState(false);
  const [issuingReceipt, setIssuingReceipt] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [cancelingPaymentId, setCancelingPaymentId] = useState<string | null>(null);
  const { toasts, push, dismiss } = useToasts();

  const debitsToReceive = openDebits.filter((d) => selectedOpen.has(d.id));
  const debitsToReceipt = paidDebits.filter((d) => selectedPaid.has(d.id));

  function toggleOpen(id: string) {
    setSelectedOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePaid(id: string) {
    setSelectedPaid((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/debits/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        push(data?.message || "Falha ao excluir. Tenta de novo.");
        return;
      }
      setOpenDebits((prev) => prev.filter((d) => d.id !== id));
      setPaidDebits((prev) => prev.filter((d) => d.id !== id));
      setConfirmDeleteId(null);
      router.refresh();
    } finally {
      setDeletingId(null);
    }
  }

  async function handleConfirmPayment(paymentMethod: string, receivedAmount: number) {
    const ids = debitsToReceive.map((d) => d.id);
    const res = await fetch(`/api/clinics/${clinicId}/debits/receive-payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ debit_ids: ids, payment_method: paymentMethod, received_amount: receivedAmount }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      push(data?.message || "Falha ao registrar o recebimento. Tenta de novo.");
      return;
    }
    const paid = (data.debits as TreatmentDebit[]) ?? [];
    const split = data.split as TreatmentDebit | null;
    setOpenDebits((prev) => {
      const withoutPaid = prev.filter((d) => !ids.includes(d.id));
      return split ? [split, ...withoutPaid] : withoutPaid;
    });
    setPaidDebits((prev) => [...paid, ...prev]);
    setSelectedOpen(new Set());
    setReceivingPayment(false);
    push(split ? "Pagamento parcial registrado." : "Pagamento registrado.", "success");
    router.refresh();
  }

  async function handleCancelPayment(id: string) {
    setCancelingPaymentId(id);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/debits/${id}/cancel-payment`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        push(data?.message || "Falha ao cancelar o recebimento. Tenta de novo.");
        return;
      }
      const updated = data.debit as TreatmentDebit;
      setPaidDebits((prev) => prev.filter((d) => d.id !== id));
      setOpenDebits((prev) => [updated, ...prev]);
      push("Recebimento cancelado.", "success");
      router.refresh();
    } finally {
      setCancelingPaymentId(null);
    }
  }

  function handleIssued(receipt: Receipt) {
    const ids = new Set(debitsToReceipt.map((d) => d.id));
    setPaidDebits((prev) => prev.map((d) => (ids.has(d.id) ? { ...d, receipt_id: receipt.id } : d)));
    setSelectedPaid(new Set());
    router.refresh();
  }

  return (
    <div>
      <div className={db.totals}>
        <div className={`${db.totalCard} ${db.totalCardOpen}`}>
          <p className={db.totalCardLabel}>A receber</p>
          <p className={db.totalCardValue}>{formatMoney(totalToReceive)}</p>
        </div>
        <div className={`${db.totalCard} ${db.totalCardPaid}`}>
          <p className={db.totalCardLabel}>Recebido</p>
          <p className={db.totalCardValue}>{formatMoney(totalReceived)}</p>
        </div>
      </div>

      <div style={{ marginBottom: 28 }}>
        <p className={db.sectionTitle}>Em aberto</p>
        {openDebits.length === 0 ? (
          <div className={styles.emptyState}>Nenhum débito em aberto.</div>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: selectedOpen.size > 0 ? 56 : 0 }}>
              {openDebits.map((d) => (
                <div key={d.id} className={db.row}>
                  <input
                    type="checkbox"
                    checked={selectedOpen.has(d.id)}
                    onChange={() => toggleOpen(d.id)}
                    style={{ width: 18, height: 18, accentColor: "var(--brand)", flexShrink: 0 }}
                  />
                  <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>{d.description}</div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{formatMoney(d.amount)}</div>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(d.id)}
                    className={`${styles.btn} ${styles.btnGhost}`}
                    style={{ color: "var(--danger)", flexShrink: 0 }}
                  >
                    Excluir
                  </button>
                </div>
              ))}
            </div>
            <Pagination page={openPage} totalPages={openTotalPages} count={openCount} itemLabel="débito" hrefFor={openHrefFor} />
          </>
        )}
      </div>

      <div style={{ marginBottom: selectedPaid.size > 0 ? 56 : 0 }}>
        <p className={db.sectionTitle}>Pago</p>
        {paidDebits.length === 0 ? (
          <div className={styles.emptyState}>Nenhum débito pago ainda.</div>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {paidDebits.map((d) => {
                const subtitleParts = [d.payment_method, d.paid_at ? formatBRDateTime(d.paid_at, "medium") : null].filter(Boolean);
                const canCancelPayment = !d.has_split && !d.receipt_id;
                const isReceipted = !!d.receipt_id;
                return (
                  <div key={d.id} className={db.row}>
                    {isReceipted ? (
                      <span style={{ width: 18, flexShrink: 0 }} />
                    ) : (
                      <input
                        type="checkbox"
                        checked={selectedPaid.has(d.id)}
                        onChange={() => togglePaid(d.id)}
                        style={{ width: 18, height: 18, accentColor: "var(--brand)", flexShrink: 0 }}
                      />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>{d.description}</div>
                      {subtitleParts.length > 0 && <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>{subtitleParts.join(" — ")}</div>}
                    </div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{formatMoney(d.amount)}</div>
                    <span className={`${styles.statusDot} ${styles.statusOk}`}>{isReceipted ? "Recibo emitido" : "Pago"}</span>
                    {canCancelPayment && (
                      <button
                        type="button"
                        disabled={cancelingPaymentId === d.id}
                        onClick={() => handleCancelPayment(d.id)}
                        className={`${styles.btn} ${styles.btnGhost}`}
                        style={{ flexShrink: 0 }}
                      >
                        {cancelingPaymentId === d.id ? "Cancelando…" : "Cancelar recebimento"}
                      </button>
                    )}
                    {!isReceipted && (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(d.id)}
                        className={`${styles.btn} ${styles.btnGhost}`}
                        style={{ color: "var(--danger)", flexShrink: 0 }}
                      >
                        Excluir
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <Pagination page={paidPage} totalPages={paidTotalPages} count={paidCount} itemLabel="débito" hrefFor={paidHrefFor} />
          </>
        )}
      </div>

      {selectedOpen.size > 0 && (
        <div className={db.bulkBar}>
          <span>
            {selectedOpen.size} débito{selectedOpen.size === 1 ? "" : "s"} selecionado{selectedOpen.size === 1 ? "" : "s"}
          </span>
          <button type="button" onClick={() => setReceivingPayment(true)} className={`${styles.btn} ${styles.btnPrimary}`}>
            Receber pagamento
          </button>
        </div>
      )}

      {selectedPaid.size > 0 && (
        <div className={db.bulkBar}>
          <span>
            {selectedPaid.size} débito{selectedPaid.size === 1 ? "" : "s"} selecionado{selectedPaid.size === 1 ? "" : "s"}
          </span>
          <button type="button" onClick={() => setIssuingReceipt(true)} className={`${styles.btn} ${styles.btnPrimary}`}>
            Emitir recibo
          </button>
        </div>
      )}

      <ReceivePaymentModal
        open={receivingPayment}
        onClose={() => setReceivingPayment(false)}
        debits={debitsToReceive}
        onConfirm={handleConfirmPayment}
      />

      <IssueReceiptModal
        open={issuingReceipt}
        onClose={() => setIssuingReceipt(false)}
        clinicId={clinicId}
        debits={debitsToReceipt}
        onIssued={handleIssued}
      />

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Excluir débito"
        message="Isso remove esse lançamento financeiro da ficha do paciente. Não é possível desfazer."
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        danger
        loading={deletingId !== null}
        onConfirm={() => confirmDeleteId && handleDelete(confirmDeleteId)}
        onCancel={() => setConfirmDeleteId(null)}
      />
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
