"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Pagination } from "@/components/ui/Pagination";
import { ToastStack, useToasts } from "@/components/ui/Toast";
import { MarkPaidModal } from "@/components/expenses/MarkPaidModal";
import { ExpenseFormModal } from "@/components/expenses/ExpenseFormModal";
import { ExpenseReceiptButton } from "@/components/expenses/ExpenseReceiptButton";
import { EXPENSE_NATURE_LABEL } from "@/lib/expenseNature";
import { formatMoneyDisplay } from "@/lib/money";
import { formatBRDateTime, addMonthsToDateStr } from "@/lib/date";
import { formatDateBR } from "@/lib/pdfTextLayout";
import type { Expense } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";
import ex from "./expenses.module.css";

function formatMoney(value: number): string {
  return `R$ ${formatMoneyDisplay(value)}`;
}

export function ExpensesPanel({
  clinicId,
  categoryOptions,
  initialPendingExpenses,
  pendingPage,
  pendingTotalPages,
  pendingCount,
  totalDue,
  initialPaidExpenses,
  paidPage,
  paidTotalPages,
  paidCount,
  totalPaidThisMonth,
  currentParams,
  month,
  monthLabel,
  todayStr,
  overdueCount,
  overdueTotal,
  overdueActive,
  fixedMonthlyCost,
  momDeltaPct,
}: {
  clinicId: string;
  categoryOptions: string[];
  initialPendingExpenses: Expense[];
  pendingPage: number;
  pendingTotalPages: number;
  pendingCount: number;
  totalDue: number;
  initialPaidExpenses: Expense[];
  paidPage: number;
  paidTotalPages: number;
  paidCount: number;
  totalPaidThisMonth: number;
  /** Filtros ativos (q/category/nature/recurring/overdue), sem page/month — base pra todo link gerado aqui, senão paginar ou trocar de mês derrubava o filtro em uso. */
  currentParams: Record<string, string>;
  month: string;
  monthLabel: string;
  todayStr: string;
  overdueCount: number;
  overdueTotal: number;
  overdueActive: boolean;
  fixedMonthlyCost: number;
  momDeltaPct: number | null;
}) {
  const router = useRouter();

  function hrefWith(overrides: Record<string, string | number>) {
    const params = new URLSearchParams(currentParams);
    for (const [k, v] of Object.entries(overrides)) {
      if (v === "" || v == null) params.delete(k);
      else params.set(k, String(v));
    }
    return `/dashboard/despesas?${params.toString()}`;
  }
  function pendingHrefFor(p: number) {
    return hrefWith({ expPage: p });
  }
  function paidHrefFor(p: number) {
    return hrefWith({ expPaidPage: p, month });
  }
  const overdueHref = hrefWith({ overdue: overdueActive ? "" : "1", expPage: 1 });

  const [pendingExpenses, setPendingExpenses] = useState(initialPendingExpenses);
  const [paidExpenses, setPaidExpenses] = useState(initialPaidExpenses);
  useEffect(() => {
    setPendingExpenses(initialPendingExpenses);
    setSelectedPending(new Set());
  }, [initialPendingExpenses]);
  useEffect(() => {
    setPaidExpenses(initialPaidExpenses);
  }, [initialPaidExpenses]);

  const [selectedPending, setSelectedPending] = useState<Set<string>>(new Set());
  const [markingPaid, setMarkingPaid] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [cancelingPaymentId, setCancelingPaymentId] = useState<string | null>(null);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const { toasts, push, dismiss } = useToasts();

  const expensesToPay = pendingExpenses.filter((e) => selectedPending.has(e.id));

  function togglePending(id: string) {
    setSelectedPending((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/expenses/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        push(data?.message || "Falha ao excluir. Tenta de novo.");
        return;
      }
      setPendingExpenses((prev) => prev.filter((e) => e.id !== id));
      setPaidExpenses((prev) => prev.filter((e) => e.id !== id));
      setConfirmDeleteId(null);
      router.refresh();
    } finally {
      setDeletingId(null);
    }
  }

  async function handleConfirmPaid(paymentMethod: string, paidAt: string, amount: number | null, receiptFile: File | null) {
    const ids = expensesToPay.map((e) => e.id);
    const res = await fetch(`/api/clinics/${clinicId}/expenses/mark-paid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expense_ids: ids, payment_method: paymentMethod, paid_at: paidAt, amount: ids.length === 1 ? amount : null }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      push(data?.message || "Falha ao registrar o pagamento. Tenta de novo.");
      return;
    }
    let paid = (data.expenses as Expense[]) ?? [];

    // Comprovante é um segundo passo best-effort, só faz sentido com uma
    // despesa por vez (ver MarkPaidModal) — uma falha aqui não desfaz o
    // pagamento já registrado.
    if (receiptFile && ids.length === 1) {
      const receiptForm = new FormData();
      receiptForm.append("receipt", receiptFile);
      const receiptRes = await fetch(`/api/clinics/${clinicId}/expenses/${ids[0]}/receipt`, { method: "POST", body: receiptForm });
      if (receiptRes.ok) {
        const receiptData = await receiptRes.json();
        paid = paid.map((e) => (e.id === ids[0] ? (receiptData.expense as Expense) : e));
      } else {
        const receiptError = await receiptRes.json().catch(() => null);
        push(receiptError?.message || "Pagamento registrado, mas falhou ao anexar o comprovante — anexe depois na lista de pagas.");
      }
    }

    setPendingExpenses((prev) => prev.filter((e) => !ids.includes(e.id)));
    setPaidExpenses((prev) => [...paid, ...prev]);
    setSelectedPending(new Set());
    setMarkingPaid(false);
    push("Pagamento registrado.", "success");
    router.refresh();
  }

  async function handleCancelPayment(id: string) {
    setCancelingPaymentId(id);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/expenses/${id}/cancel-payment`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        push(data?.message || "Falha ao cancelar o pagamento. Tenta de novo.");
        return;
      }
      const updated = data.expense as Expense;
      setPaidExpenses((prev) => prev.filter((e) => e.id !== id));
      setPendingExpenses((prev) => [updated, ...prev]);
      push("Pagamento cancelado.", "success");
      router.refresh();
    } finally {
      setCancelingPaymentId(null);
    }
  }

  return (
    <div>
      <div className={ex.totals}>
        <div className={`${ex.totalCard} ${ex.totalCardDue}`}>
          <p className={ex.totalCardLabel}>A pagar</p>
          <p className={ex.totalCardValue}>{formatMoney(totalDue)}</p>
        </div>
        <a
          href={overdueHref}
          className={`${ex.totalCard} ${ex.totalCardDue}`}
          style={{ textDecoration: "none", outline: overdueActive ? "2px solid var(--danger)" : "none" }}
        >
          <p className={ex.totalCardLabel}>Vencidas</p>
          <p className={ex.totalCardValue}>
            {overdueCount} · {formatMoney(overdueTotal)}
          </p>
        </a>
        <div className={`${ex.totalCard} ${ex.totalCardPaid}`}>
          <p className={ex.totalCardLabel}>Pago em {monthLabel}</p>
          <p className={ex.totalCardValue}>
            {formatMoney(totalPaidThisMonth)}
            {momDeltaPct != null && (
              <span style={{ fontSize: 12, fontWeight: 700, marginLeft: 6, color: momDeltaPct > 0 ? "var(--danger)" : "var(--brand-deep)" }}>
                {momDeltaPct > 0 ? "↑" : momDeltaPct < 0 ? "↓" : ""}
                {Math.abs(momDeltaPct)}%
              </span>
            )}
          </p>
        </div>
        <div className={ex.totalCard}>
          <p className={ex.totalCardLabel}>Custo fixo mensal</p>
          <p className={ex.totalCardValue}>{formatMoney(fixedMonthlyCost)}</p>
        </div>
      </div>

      <div className={styles.panel} style={{ marginBottom: 16 }}>
        <div className={styles.panelHeader}>
          <p className={styles.panelHeaderTitle}>Pendente</p>
          {pendingCount > 0 && <span className={ex.categoryTag}>{pendingCount}</span>}
          {overdueActive && (
            <a href={hrefWith({ overdue: "" })} className={styles.hint} style={{ marginLeft: "auto" }}>
              Mostrando só vencidas — limpar
            </a>
          )}
        </div>
        <div className={styles.panelBody}>
          {pendingExpenses.length === 0 ? (
            <div className={styles.emptyState}>Nenhuma despesa pendente.</div>
          ) : (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: selectedPending.size > 0 ? 56 : 0 }}>
                {pendingExpenses.map((e) => (
                  <div key={e.id} className={ex.row}>
                    <input
                      type="checkbox"
                      checked={selectedPending.has(e.id)}
                      onChange={() => togglePending(e.id)}
                      style={{ width: 18, height: 18, accentColor: "var(--brand)", flexShrink: 0 }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>{e.description}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                        {e.nature && <span className={ex.categoryTag}>{EXPENSE_NATURE_LABEL[e.nature]}</span>}
                        {e.category && <span className={ex.categoryTag}>{e.category}</span>}
                        {e.due_date < todayStr ? (
                          <span className={ex.dueTag} style={{ background: "var(--danger-tint)", color: "var(--danger)" }}>
                            Venceu {formatDateBR(e.due_date)}
                          </span>
                        ) : (
                          <span className={ex.dueTag}>Vence {formatDateBR(e.due_date)}</span>
                        )}
                      </div>
                    </div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{formatMoney(e.amount)}</div>
                    <button
                      type="button"
                      onClick={() => setEditingExpense(e)}
                      className={`${styles.btn} ${styles.btnGhost}`}
                      style={{ flexShrink: 0 }}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(e.id)}
                      className={`${styles.btn} ${styles.btnGhost}`}
                      style={{ color: "var(--danger)", flexShrink: 0 }}
                    >
                      Excluir
                    </button>
                  </div>
                ))}
              </div>
              <Pagination page={pendingPage} totalPages={pendingTotalPages} count={pendingCount} itemLabel="despesa" hrefFor={pendingHrefFor} />
            </>
          )}
        </div>
      </div>

      <div className={styles.panel} style={{ marginBottom: 0 }}>
        <div className={styles.panelHeader} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <p className={styles.panelHeaderTitle} style={{ margin: 0, paddingRight: 8 }}>Pago</p>
          {paidCount > 0 && <span className={ex.categoryTag}>{paidCount}</span>}
          
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginLeft: "auto" }}>
            <a href={hrefWith({ month: addMonthsToDateStr(`${month}-01`, -1).slice(0, 7), expPaidPage: 1 })} className={`${styles.btn} ${styles.btnGhost}`} style={{ padding: "4px 10px" }}>
              ‹
            </a>
            <span style={{ fontSize: 13, fontWeight: 600, minWidth: 130, textAlign: "center" }}>{monthLabel}</span>
            <a href={hrefWith({ month: addMonthsToDateStr(`${month}-01`, 1).slice(0, 7), expPaidPage: 1 })} className={`${styles.btn} ${styles.btnGhost}`} style={{ padding: "4px 10px" }}>
              ›
            </a>
          </div>
        </div>
        <div className={styles.panelBody}>
          {paidExpenses.length === 0 ? (
            <div className={styles.emptyState}>Nenhuma despesa paga neste mês.</div>
          ) : (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {paidExpenses.map((e) => (
                  <div key={e.id} className={ex.row}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>{e.description}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                        {e.nature && <span className={ex.categoryTag}>{EXPENSE_NATURE_LABEL[e.nature]}</span>}
                        {e.category && <span className={ex.categoryTag}>{e.category}</span>}
                        {e.payment_method && <span className={ex.categoryTag}>{e.payment_method}</span>}
                        {e.paid_at && <span className={ex.dateTag}>{formatBRDateTime(e.paid_at, "medium")}</span>}
                      </div>
                    </div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{formatMoney(e.amount)}</div>
                    <span className={`${styles.statusDot} ${styles.statusOk}`}>Pago</span>
                    <ExpenseReceiptButton
                      clinicId={clinicId}
                      expense={e}
                      onUploaded={(updated) => setPaidExpenses((prev) => prev.map((it) => (it.id === updated.id ? updated : it)))}
                      onError={(message) => push(message)}
                    />
                    <button
                      type="button"
                      disabled={cancelingPaymentId === e.id}
                      onClick={() => handleCancelPayment(e.id)}
                      className={`${styles.btn} ${styles.btnGhost}`}
                      style={{ flexShrink: 0 }}
                    >
                      {cancelingPaymentId === e.id ? "Cancelando…" : "Cancelar pagamento"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingExpense(e)}
                      className={`${styles.btn} ${styles.btnGhost}`}
                      style={{ flexShrink: 0 }}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(e.id)}
                      className={`${styles.btn} ${styles.btnGhost}`}
                      style={{ color: "var(--danger)", flexShrink: 0 }}
                    >
                      Excluir
                    </button>
                  </div>
                ))}
              </div>
              <Pagination page={paidPage} totalPages={paidTotalPages} count={paidCount} itemLabel="despesa" hrefFor={paidHrefFor} />
            </>
          )}
        </div>
      </div>

      {selectedPending.size > 0 && (
        <div className={ex.bulkBar}>
          <span>
            {selectedPending.size} despesa{selectedPending.size === 1 ? "" : "s"} selecionada{selectedPending.size === 1 ? "" : "s"}
          </span>
          <button type="button" onClick={() => setMarkingPaid(true)} className={`${styles.btn} ${styles.btnPrimary}`}>
            Marcar como pago
          </button>
        </div>
      )}

      <MarkPaidModal open={markingPaid} onClose={() => setMarkingPaid(false)} expenses={expensesToPay} onConfirm={handleConfirmPaid} />

      <ExpenseFormModal
        clinicId={clinicId}
        categoryOptions={categoryOptions}
        open={editingExpense !== null}
        onClose={() => setEditingExpense(null)}
        expense={editingExpense}
      />

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Excluir despesa"
        message="Isso remove esse lançamento financeiro da clínica. Não é possível desfazer."
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
