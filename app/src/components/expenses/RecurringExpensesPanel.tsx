"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ToastStack, useToasts } from "@/components/ui/Toast";
import { ExpenseFormModal } from "@/components/expenses/ExpenseFormModal";
import { formatMoneyDisplay } from "@/lib/money";
import { EXPENSE_NATURE_LABEL } from "@/lib/expenseNature";
import type { RecurringExpense } from "@/lib/database.types";
import { TrashIcon } from "@/components/expenses/icons";
import styles from "@/styles/shell.module.css";
import ex from "./expenses.module.css";

function ToggleSwitch({ checked, disabled, onChange, label }: { checked: boolean; disabled?: boolean; onChange: () => void; label: string }) {
  return (
    <label className={ex.switch} aria-label={label} title={label}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={onChange} />
      <span className={ex.switchTrack} />
    </label>
  );
}

/** Lista das regras de despesa recorrente — a despesa em si (mês a mês) é gerada pelo cron a partir daqui, ver generateDueExpenses. */
export function RecurringExpensesPanel({
  clinicId,
  categoryOptions,
  initialRecurring,
}: {
  clinicId: string;
  categoryOptions: string[];
  initialRecurring: RecurringExpense[];
}) {
  const router = useRouter();
  const [recurring, setRecurring] = useState(initialRecurring);
  useEffect(() => setRecurring(initialRecurring), [initialRecurring]);

  // Edição abre o mesmo modal de "Nova despesa" (ver ExpenseFormModal) em vez
  // de um editor inline na linha — consistência com o resto do app.
  const [editingRecurring, setEditingRecurring] = useState<RecurringExpense | null>(null);

  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const { toasts, push, dismiss } = useToasts();

  async function handleToggleActive(r: RecurringExpense) {
    setTogglingId(r.id);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/recurring-expenses/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !r.active }),
      });
      const data = await res.json();
      if (!res.ok) {
        push("Falha ao atualizar. Tenta de novo.");
        return;
      }
      setRecurring((prev) => prev.map((it) => (it.id === r.id ? (data.recurring_expense as RecurringExpense) : it)));
      router.refresh();
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/recurring-expenses/${id}`, { method: "DELETE" });
      if (!res.ok) {
        push("Falha ao excluir. Tenta de novo.");
        return;
      }
      setRecurring((prev) => prev.filter((r) => r.id !== id));
      setConfirmDeleteId(null);
      router.refresh();
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className={styles.panel} style={{ marginBottom: 0 }}>
      <div className={styles.panelHeader}>
        <p className={styles.panelHeaderTitle}>Despesas recorrentes</p>
        {recurring.length > 0 && <span className={ex.categoryTag}>{recurring.length}</span>}
      </div>
      <div className={styles.panelBody}>
      {recurring.length === 0 ? (
        <div className={styles.emptyState}>Nenhuma despesa recorrente cadastrada.</div>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th style={{ width: 50 }}>Ativa</th>
              <th>Categoria</th>
              <th>Natureza</th>
              <th>Descrição</th>
              <th>Valor</th>
              <th>Dia</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {recurring.map((r) => (
              <tr key={r.id} className="clickableRow" onClick={() => setEditingRecurring(r)} style={{ opacity: r.active ? 1 : 0.55 }}>
                <td onClick={(e) => e.stopPropagation()}>
                  <ToggleSwitch
                    checked={r.active}
                    disabled={togglingId === r.id}
                    onChange={() => handleToggleActive(r)}
                    label={r.active ? "Desativar recorrência" : "Ativar recorrência"}
                  />
                </td>
                <td data-label="Categoria">{r.category || "—"}</td>
                <td data-label="Natureza">{r.nature ? EXPENSE_NATURE_LABEL[r.nature] : "—"}</td>
                <td className={styles.rowTitle}>{r.description}</td>
                <td data-label="Valor">{formatMoneyDisplay(r.amount)}</td>
                <td data-label="Dia">{r.day_of_month}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(r.id)}
                    className={`${ex.iconBtn} ${ex.iconBtnDanger}`}
                    style={{ marginLeft: "auto" }}
                    title="Excluir despesa recorrente"
                    aria-label="Excluir despesa recorrente"
                  >
                    <TrashIcon />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      </div>

      <ExpenseFormModal
        clinicId={clinicId}
        categoryOptions={categoryOptions}
        open={editingRecurring !== null}
        onClose={() => setEditingRecurring(null)}
        recurringExpense={editingRecurring}
      />

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Excluir despesa recorrente"
        message="Isso remove o molde — as despesas já geradas por ele continuam existindo, só deixam de se repetir todo mês."
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
