"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useEscapeToClose } from "@/lib/useEscapeToClose";
import { formatMoneyInput, parseMoneyInput } from "@/lib/money";
import { brDateOnly } from "@/lib/date";
import { CategoryCombobox } from "@/components/expenses/CategoryCombobox";
import { ToastStack, useToasts } from "@/components/ui/Toast";
import uiStyles from "@/components/ui/ui.module.css";
import shellStyles from "@/styles/shell.module.css";

/**
 * "Despesa recorrente" ligado cria um MOLDE em `recurring_expenses` — a
 * primeira ocorrência de verdade só nasce na próxima passada do cron
 * (generateDueExpenses), não na hora. Evita duplicar a lógica de geração
 * em dois lugares.
 */
export function NewExpenseModal({ clinicId, categoryOptions }: { clinicId: string; categoryOptions: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [recurring, setRecurring] = useState(false);
  const [dueDate, setDueDate] = useState(brDateOnly());
  const [dayOfMonth, setDayOfMonth] = useState("5");
  const [saving, setSaving] = useState(false);
  const { toasts, push, dismiss } = useToasts();

  useEscapeToClose(() => setOpen(false), open);

  function resetAndClose() {
    setDescription("");
    setCategory("");
    setAmount("");
    setRecurring(false);
    setDueDate(brDateOnly());
    setDayOfMonth("5");
    setOpen(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = parseMoneyInput(amount);
    if (!description.trim() || value <= 0) {
      push("Preencha a descrição e o valor.");
      return;
    }
    setSaving(true);
    try {
      const url = recurring ? `/api/clinics/${clinicId}/recurring-expenses` : `/api/clinics/${clinicId}/expenses`;
      const body = recurring
        ? { description: description.trim(), category: category.trim() || null, amount: value, day_of_month: parseInt(dayOfMonth, 10) }
        : { description: description.trim(), category: category.trim() || null, amount: value, due_date: dueDate };
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        push(data?.message || "Falha ao salvar. Tenta de novo.");
        return;
      }
      resetAndClose();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button type="button" className={`${shellStyles.btn} ${shellStyles.btnPrimary}`} onClick={() => setOpen(true)}>
        + Nova despesa
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div className={uiStyles.overlay} onClick={() => setOpen(false)}>
            <div className={uiStyles.dialog} style={{ maxWidth: 520 }} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
                <h3 className={uiStyles.dialogTitle}>Nova despesa</h3>
                <button type="button" className={uiStyles.toastClose} onClick={() => setOpen(false)} aria-label="Fechar">
                  ×
                </button>
              </div>

              <form onSubmit={handleSubmit}>
                <div className={shellStyles.field} style={{ marginBottom: 14 }}>
                  <label htmlFor="expDescription" className={shellStyles.label}>
                    Descrição*
                  </label>
                  <input
                    id="expDescription"
                    type="text"
                    className={shellStyles.input}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Aluguel, material de consumo, etc."
                    required
                  />
                </div>

                <div className={shellStyles.formRow} style={{ marginBottom: 14 }}>
                  <div className={shellStyles.field}>
                    <label htmlFor="expCategory" className={shellStyles.label}>
                      Categoria
                    </label>
                    <CategoryCombobox id="expCategory" value={category} onChange={setCategory} options={categoryOptions} />
                  </div>
                  <div className={shellStyles.field}>
                    <label htmlFor="expAmount" className={shellStyles.label}>
                      Valor*
                    </label>
                    <input
                      id="expAmount"
                      type="text"
                      inputMode="numeric"
                      className={shellStyles.input}
                      value={amount}
                      onChange={(e) => setAmount(formatMoneyInput(e.target.value))}
                      placeholder="0,00"
                      required
                    />
                  </div>
                </div>

                <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}>
                  <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} style={{ width: 16, height: 16, accentColor: "var(--brand)" }} />
                  Despesa recorrente (todo mês)
                </label>

                {recurring ? (
                  <div className={shellStyles.field} style={{ marginBottom: 14, maxWidth: 160 }}>
                    <label htmlFor="expDay" className={shellStyles.label}>
                      Dia do mês*
                    </label>
                    <input
                      id="expDay"
                      type="number"
                      min={1}
                      max={28}
                      className={shellStyles.input}
                      value={dayOfMonth}
                      onChange={(e) => setDayOfMonth(e.target.value)}
                      required
                    />
                  </div>
                ) : (
                  <div className={shellStyles.field} style={{ marginBottom: 14, maxWidth: 200 }}>
                    <label htmlFor="expDueDate" className={shellStyles.label}>
                      Data de vencimento*
                    </label>
                    <input
                      id="expDueDate"
                      type="date"
                      className={shellStyles.input}
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      required
                    />
                  </div>
                )}

                {recurring && (
                  <p style={{ fontSize: 12, color: "var(--ink-faint)", margin: "-6px 0 14px" }}>
                    A primeira despesa desta recorrência aparece como pendente a partir de amanhã — não é gerada na hora.
                  </p>
                )}

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                  <button type="button" disabled={saving} onClick={() => setOpen(false)} className={`${shellStyles.btn} ${shellStyles.btnGhost}`}>
                    Cancelar
                  </button>
                  <button type="submit" disabled={saving} className={`${shellStyles.btn} ${shellStyles.btnPrimary}`}>
                    {saving ? "Salvando…" : "Salvar"}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </>
  );
}
