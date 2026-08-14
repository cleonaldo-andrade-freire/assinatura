"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ToastStack, useToasts } from "@/components/ui/Toast";
import { CategoryCombobox } from "@/components/expenses/CategoryCombobox";
import { formatMoneyDisplay, formatMoneyInput, parseMoneyInput } from "@/lib/money";
import type { RecurringExpense } from "@/lib/database.types";
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

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDescription, setEditDescription] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editDay, setEditDay] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const { toasts, push, dismiss } = useToasts();

  function startEdit(r: RecurringExpense) {
    setEditingId(r.id);
    setEditDescription(r.description);
    setEditCategory(r.category ?? "");
    setEditAmount(formatMoneyDisplay(r.amount));
    setEditDay(String(r.day_of_month));
  }

  async function handleSaveEdit(id: string) {
    const amount = parseMoneyInput(editAmount);
    const day = parseInt(editDay, 10);
    if (!editDescription.trim() || amount <= 0 || !day || day < 1 || day > 28) {
      push("Preencha descrição, valor e um dia entre 1 e 28.");
      return;
    }
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/recurring-expenses/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: editDescription.trim(), category: editCategory.trim() || null, amount, day_of_month: day }),
      });
      const data = await res.json();
      if (!res.ok) {
        push(data.message || "Falha ao salvar.");
        return;
      }
      setRecurring((prev) => prev.map((r) => (r.id === id ? (data.recurring_expense as RecurringExpense) : r)));
      setEditingId(null);
      router.refresh();
    } finally {
      setSavingEdit(false);
    }
  }

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
              <th>Descrição</th>
              <th>Valor</th>
              <th>Dia</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {recurring.map((r) =>
              editingId === r.id ? (
                <tr key={r.id}>
                  <td></td>
                  <td>
                    <CategoryCombobox id={`edit-cat-${r.id}`} value={editCategory} onChange={setEditCategory} options={categoryOptions} />
                  </td>
                  <td>
                    <input type="text" className={styles.input} value={editDescription} onChange={(e) => setEditDescription(e.target.value)} required />
                  </td>
                  <td style={{ maxWidth: 110 }}>
                    <input
                      type="text"
                      inputMode="numeric"
                      className={styles.input}
                      value={editAmount}
                      onChange={(e) => setEditAmount(formatMoneyInput(e.target.value))}
                      required
                    />
                  </td>
                  <td style={{ maxWidth: 70 }}>
                    <input type="number" min={1} max={28} className={styles.input} value={editDay} onChange={(e) => setEditDay(e.target.value)} required />
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      <button type="button" disabled={savingEdit} onClick={() => handleSaveEdit(r.id)} className={`${styles.btn} ${styles.btnPrimary}`}>
                        {savingEdit ? "Salvando…" : "Salvar"}
                      </button>
                      <button type="button" disabled={savingEdit} onClick={() => setEditingId(null)} className={`${styles.btn} ${styles.btnGhost}`}>
                        Cancelar
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={r.id} style={{ opacity: r.active ? 1 : 0.55 }}>
                  <td>
                    <ToggleSwitch
                      checked={r.active}
                      disabled={togglingId === r.id}
                      onChange={() => handleToggleActive(r)}
                      label={r.active ? "Desativar recorrência" : "Ativar recorrência"}
                    />
                  </td>
                  <td data-label="Categoria">{r.category || "—"}</td>
                  <td className={styles.rowTitle}>{r.description}</td>
                  <td data-label="Valor">{formatMoneyDisplay(r.amount)}</td>
                  <td data-label="Dia">{r.day_of_month}</td>
                  <td>
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      <button type="button" onClick={() => startEdit(r)} className={`${styles.btn} ${styles.btnGhost}`}>
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(r.id)}
                        className={`${styles.btn} ${styles.btnGhost}`}
                        style={{ color: "var(--danger)" }}
                      >
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      )}

      </div>

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
