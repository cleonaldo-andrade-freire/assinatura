"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useEscapeToClose } from "@/lib/useEscapeToClose";
import { formatMoneyInput, formatMoneyDisplay, parseMoneyInput } from "@/lib/money";
import { brDateOnly } from "@/lib/date";
import { PAYMENT_METHODS } from "@/lib/paymentMethods";
import { EXPENSE_NATURES, EXPENSE_NATURE_LABEL } from "@/lib/expenseNature";
import { CategoryCombobox } from "@/components/expenses/CategoryCombobox";
import { ReceiptPickerModal } from "@/components/expenses/ReceiptPickerModal";
import { ToastStack, useToasts } from "@/components/ui/Toast";
import type { Expense, ExpenseNature, RecurringExpense } from "@/lib/database.types";
import uiStyles from "@/components/ui/ui.module.css";
import shellStyles from "@/styles/shell.module.css";
import ex from "./expenses.module.css";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function uploadReceipt(clinicId: string, expenseId: string, file: File): Promise<{ ok: boolean; message?: string }> {
  const form = new FormData();
  form.append("receipt", file);
  const res = await fetch(`/api/clinics/${clinicId}/expenses/${expenseId}/receipt`, { method: "POST", body: form });
  if (res.ok) return { ok: true };
  const data = await res.json().catch(() => null);
  return { ok: false, message: data?.message };
}

/**
 * Modal único pra criar despesa, editar uma despesa existente E editar uma
 * regra de despesa recorrente — controlado de fora (open/onClose), pra caber
 * no botão "+ Nova despesa" do cabeçalho, no "Editar" de cada linha da lista
 * e no "Editar" do painel de recorrências (RecurringExpensesPanel, que antes
 * tinha seu próprio editor de linha inline). Editando (despesa ou
 * recorrência), some a seção de Pagamento (isso já tem fluxo próprio:
 * MarkPaidModal, cancelar pagamento) — só os campos que o PATCH de fato
 * aceita ficam editáveis.
 */
export function ExpenseFormModal({
  clinicId,
  categoryOptions,
  open,
  onClose,
  expense,
  recurringExpense,
}: {
  clinicId: string;
  categoryOptions: string[];
  open: boolean;
  onClose: () => void;
  /** Presente = modo edição (PATCH numa despesa existente); ausente/null = criar. */
  expense?: Expense | null;
  /** Presente = modo edição de uma regra de despesa recorrente (PATCH em recurring-expenses). */
  recurringExpense?: RecurringExpense | null;
}) {
  const router = useRouter();
  const editingExpense = !!expense;
  const editingRecurring = !!recurringExpense;
  const editing = editingExpense || editingRecurring;
  // Editando uma despesa pendente, oferece registrar o pagamento ali mesmo
  // (reaproveita /expenses/mark-paid, mesma API do MarkPaidModal) — antes só
  // dava pra fazer isso marcando o checkbox na lista + botão separado.
  const isPendingExpense = editingExpense && expense?.status === "pendente";
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [nature, setNature] = useState<ExpenseNature | "">("");
  const [amount, setAmount] = useState("");
  const [recurring, setRecurring] = useState(false);
  const [dueDate, setDueDate] = useState(brDateOnly());
  const [dayOfMonth, setDayOfMonth] = useState("5");
  const [alreadyPaid, setAlreadyPaid] = useState(false);
  const [paidAt, setPaidAt] = useState(brDateOnly());
  const [paymentMethod, setPaymentMethod] = useState("Pix");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [pickingReceipt, setPickingReceipt] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toasts, push, dismiss } = useToasts();

  useEscapeToClose(onClose, open && !pickingReceipt);

  // Repopula os campos toda vez que o modal abre — pra limpar do zero
  // (criar), carregar a despesa clicada (editar) ou carregar a regra de
  // recorrência clicada (editar recorrência).
  useEffect(() => {
    if (!open) return;
    const source = recurringExpense ?? expense;
    setDescription(source?.description ?? "");
    setCategory(source?.category ?? "");
    setNature(source?.nature ?? "");
    setAmount(source ? formatMoneyDisplay(Number(source.amount)) : "");
    setDueDate(expense?.due_date ?? brDateOnly());
    setDayOfMonth(recurringExpense ? String(recurringExpense.day_of_month) : "5");
    setRecurring(false);
    setAlreadyPaid(false);
    setPaymentMethod("Pix");
    setPaidAt(brDateOnly());
    setReceiptFile(null);
  }, [open, expense, recurringExpense]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = parseMoneyInput(amount);
    if (!description.trim() || value <= 0) {
      push("Preencha a descrição e o valor.");
      return;
    }
    if (editingRecurring) {
      const day = parseInt(dayOfMonth, 10);
      if (!day || day < 1 || day > 28) {
        push("Informe um dia entre 1 e 28.");
        return;
      }
    }
    if (alreadyPaid && !paymentMethod) {
      push("Selecione o meio de pagamento.");
      return;
    }
    setSaving(true);
    try {
      const base = {
        description: description.trim(),
        category: category.trim() || null,
        nature: nature || null,
        amount: value,
      };

      if (editingRecurring && recurringExpense) {
        const res = await fetch(`/api/clinics/${clinicId}/recurring-expenses/${recurringExpense.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...base, day_of_month: parseInt(dayOfMonth, 10) }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          push(data?.message || "Falha ao salvar. Tenta de novo.");
          return;
        }
      } else if (editingExpense && expense) {
        const res = await fetch(`/api/clinics/${clinicId}/expenses/${expense.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...base, due_date: dueDate }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          push(data?.message || "Falha ao salvar. Tenta de novo.");
          return;
        }

        if (isPendingExpense && alreadyPaid) {
          const payRes = await fetch(`/api/clinics/${clinicId}/expenses/mark-paid`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ expense_ids: [expense.id], payment_method: paymentMethod, paid_at: paidAt, amount: value }),
          });
          const payData = await payRes.json().catch(() => null);
          if (!payRes.ok) {
            push(payData?.message || "Despesa salva, mas falhou ao registrar o pagamento. Tenta marcar como pago na lista.");
          } else if (receiptFile) {
            const uploaded = await uploadReceipt(clinicId, expense.id, receiptFile);
            if (!uploaded.ok) push(uploaded.message || "Pagamento registrado, mas falhou ao anexar o comprovante — anexe depois na lista de pagas.");
          }
        }
      } else if (recurring) {
        const res = await fetch(`/api/clinics/${clinicId}/recurring-expenses`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...base, day_of_month: parseInt(dayOfMonth, 10) }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          push(data?.message || "Falha ao salvar. Tenta de novo.");
          return;
        }

        if (alreadyPaid) {
          const expRes = await fetch(`/api/clinics/${clinicId}/expenses`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...base,
              due_date: brDateOnly(),
              already_paid: true,
              payment_method: paymentMethod,
              recurring_expense_id: data.recurring_expense.id,
            }),
          });
          const expData = await expRes.json().catch(() => null);
          if (!expRes.ok) {
            push(expData?.message || "Recorrência criada, mas falhou ao lançar a ocorrência de hoje já paga.");
          } else if (receiptFile) {
            const uploaded = await uploadReceipt(clinicId, expData.expense.id, receiptFile);
            if (!uploaded.ok) push(uploaded.message || "Salvo, mas falhou ao anexar o comprovante — anexe depois na lista de pagas.");
          }
        }
      } else {
        const res = await fetch(`/api/clinics/${clinicId}/expenses`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...base,
            due_date: dueDate,
            already_paid: alreadyPaid,
            payment_method: alreadyPaid ? paymentMethod : null,
          }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          push(data?.message || "Falha ao salvar. Tenta de novo.");
          return;
        }
        if (alreadyPaid && receiptFile) {
          const uploaded = await uploadReceipt(clinicId, data.expense.id, receiptFile);
          if (!uploaded.ok) push(uploaded.message || "Despesa salva, mas falhou ao anexar o comprovante — anexe depois na lista de pagas.");
        }
      }

      onClose();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <>
      <div className={uiStyles.overlay} onClick={onClose}>
        <div className={uiStyles.dialog} style={{ maxWidth: 540 }} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
            <h3 className={uiStyles.dialogTitle}>
              {editingRecurring ? "Editar despesa recorrente" : editingExpense ? "Editar despesa" : "Nova despesa"}
            </h3>
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
                <label htmlFor="expValor" className={shellStyles.label}>
                  Valor*
                </label>
                <input
                  id="expValor"
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

            <div className={shellStyles.formRow} style={{ marginBottom: 20 }}>
              <div className={shellStyles.field} style={{ maxWidth: 220 }}>
                <label htmlFor="expNature" className={shellStyles.label}>
                  Natureza
                </label>
                <select id="expNature" className={shellStyles.select} value={nature} onChange={(e) => setNature(e.target.value as ExpenseNature | "")}>
                  <option value="">Não informada</option>
                  {EXPENSE_NATURES.map((n) => (
                    <option key={n} value={n}>
                      {EXPENSE_NATURE_LABEL[n]}
                    </option>
                  ))}
                </select>
              </div>
              {editingRecurring ? (
                <div className={shellStyles.field} style={{ maxWidth: 160 }}>
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
                (editingExpense || !recurring) && (
                  <div className={shellStyles.field} style={{ maxWidth: 200 }}>
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
                )
              )}
            </div>

            {isPendingExpense && (
              <div style={{ borderTop: "1px solid var(--line-soft)", paddingTop: 16, marginBottom: 20 }}>
                <p className={shellStyles.fgroupLabel} style={{ marginBottom: 10 }}>
                  Pagamento
                </p>
                <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={alreadyPaid}
                    onChange={(e) => setAlreadyPaid(e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: "var(--brand)" }}
                  />
                  Registrar pagamento
                </label>

                {alreadyPaid && (
                  <>
                    <div className={shellStyles.formRow} style={{ marginBottom: 14 }}>
                      <div className={shellStyles.field}>
                        <label htmlFor="expPaymentMethod" className={shellStyles.label}>
                          Meio de pagamento*
                        </label>
                        <select
                          id="expPaymentMethod"
                          className={shellStyles.select}
                          value={paymentMethod}
                          onChange={(e) => setPaymentMethod(e.target.value)}
                          required
                        >
                          <option value="">Selecione…</option>
                          {PAYMENT_METHODS.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className={shellStyles.field}>
                        <label htmlFor="expPaidAt" className={shellStyles.label}>
                          Data do pagamento*
                        </label>
                        <input
                          id="expPaidAt"
                          type="date"
                          className={shellStyles.input}
                          value={paidAt}
                          onChange={(e) => setPaidAt(e.target.value)}
                          required
                        />
                      </div>
                    </div>

                    <div className={shellStyles.field} style={{ marginBottom: 4 }}>
                      <label className={shellStyles.label}>Comprovante</label>
                      {receiptFile ? (
                        <div className={ex.filePickedRow}>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{receiptFile.name}</span>
                          <span style={{ color: "var(--ink-faint)", flexShrink: 0 }}>{formatFileSize(receiptFile.size)}</span>
                          <button type="button" onClick={() => setReceiptFile(null)} className={ex.filePickedRemove} aria-label="Remover" title="Remover">
                            ×
                          </button>
                        </div>
                      ) : (
                        <button type="button" onClick={() => setPickingReceipt(true)} className={`${shellStyles.btn} ${shellStyles.btnGhost}`}>
                          + Anexar comprovante
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {!editing && (
              <>
                <p className={shellStyles.fgroupLabel} style={{ marginBottom: 10 }}>
                  Recorrência
                </p>
                <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}>
                  <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} style={{ width: 16, height: 16, accentColor: "var(--brand)" }} />
                  Despesa recorrente (todo mês)
                </label>

                {recurring && (
                  <div className={shellStyles.field} style={{ marginBottom: 8, maxWidth: 160 }}>
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
                )}

                {recurring && (
                  <p style={{ fontSize: 12, color: "var(--ink-faint)", margin: "0 0 20px" }}>
                    Sem "Já foi pago" marcado, a primeira ocorrência aparece como pendente a partir de amanhã — não é gerada na hora.
                  </p>
                )}

                <div style={{ borderTop: "1px solid var(--line-soft)", paddingTop: 16, marginTop: recurring ? 0 : 20 }}>
                  <p className={shellStyles.fgroupLabel} style={{ marginBottom: 10 }}>
                    Pagamento
                  </p>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={alreadyPaid}
                      onChange={(e) => setAlreadyPaid(e.target.checked)}
                      style={{ width: 16, height: 16, accentColor: "var(--brand)" }}
                    />
                    Já foi pago{recurring ? " (a ocorrência de hoje)" : ""}
                  </label>

                  {alreadyPaid && (
                    <>
                      {recurring && (
                        <p style={{ fontSize: 12, color: "var(--ink-faint)", margin: "-8px 0 14px" }}>
                          Lança a ocorrência de hoje já paga; os próximos meses seguem gerando pendentes normalmente, pelo dia informado acima.
                        </p>
                      )}
                      <div className={shellStyles.field} style={{ marginBottom: 14, maxWidth: 240 }}>
                        <label htmlFor="expPaymentMethod" className={shellStyles.label}>
                          Meio de pagamento*
                        </label>
                        <select
                          id="expPaymentMethod"
                          className={shellStyles.select}
                          value={paymentMethod}
                          onChange={(e) => setPaymentMethod(e.target.value)}
                          required
                        >
                          <option value="">Selecione…</option>
                          {PAYMENT_METHODS.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className={shellStyles.field} style={{ marginBottom: 4 }}>
                        <label className={shellStyles.label}>Comprovante</label>
                        {receiptFile ? (
                          <div className={ex.filePickedRow}>
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{receiptFile.name}</span>
                            <span style={{ color: "var(--ink-faint)", flexShrink: 0 }}>{formatFileSize(receiptFile.size)}</span>
                            <button type="button" onClick={() => setReceiptFile(null)} className={ex.filePickedRemove} aria-label="Remover" title="Remover">
                              ×
                            </button>
                          </div>
                        ) : (
                          <button type="button" onClick={() => setPickingReceipt(true)} className={`${shellStyles.btn} ${shellStyles.btnGhost}`}>
                            + Anexar comprovante
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
              <button type="button" disabled={saving} onClick={onClose} className={`${shellStyles.btn} ${shellStyles.btnGhost}`}>
                Cancelar
              </button>
              <button type="submit" disabled={saving} className={`${shellStyles.btn} ${shellStyles.btnPrimary}`}>
                {saving ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </form>
        </div>
      </div>

      <ReceiptPickerModal open={pickingReceipt} onClose={() => setPickingReceipt(false)} onPicked={setReceiptFile} />
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </>,
    document.body
  );
}
