import { redirect } from "next/navigation";
import { getClinicAndRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ClinicShell } from "@/components/clinic/ClinicShell";
import { ExpensesPanel } from "@/components/expenses/ExpensesPanel";
import { RecurringExpensesPanel } from "@/components/expenses/RecurringExpensesPanel";
import { NewExpenseModal } from "@/components/expenses/NewExpenseModal";
import { EXPENSE_CATEGORY_SUGGESTIONS } from "@/lib/expenseCategories";
import { addMonthsToDateStr, brDateOnly, firstOfNextMonth, formatBRMonthLabel } from "@/lib/date";
import type { Expense, RecurringExpense } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

const DOCS_PAGE_SIZE = 5;

export default async function DespesasPage({
  searchParams,
}: {
  searchParams: {
    expPage?: string;
    expPaidPage?: string;
    overdue?: string;
    month?: string;
  };
}) {
  const auth = await getClinicAndRole();
  if (!auth) redirect("/login");
  if (auth.role !== "owner") redirect("/dashboard");
  const { clinic, role, userEmail, userName, userAvatarUrl } = auth;

  const supabase = await createSupabaseServerClient();
  const today = brDateOnly();

  const overdueActive = searchParams.overdue === "1";
  const month = /^\d{4}-\d{2}$/.test(searchParams.month ?? "") ? (searchParams.month as string) : today.slice(0, 7);
  const monthStart = `${month}-01`;
  const monthEnd = firstOfNextMonth(monthStart);
  const prevMonthStart = addMonthsToDateStr(monthStart, -1);
  const monthLabel = formatBRMonthLabel(month);

  // Base pra todo link gerado nas telas (paginação, mudar de mês, alternar "vencidas").
  const currentParams: Record<string, string> = {};
  if (overdueActive) currentParams.overdue = "1";

  const pendingPage = Math.max(1, parseInt(searchParams.expPage ?? "1", 10) || 1);
  const pFrom = (pendingPage - 1) * DOCS_PAGE_SIZE;
  const pTo = pFrom + DOCS_PAGE_SIZE - 1;
  let pendingQuery = supabase.from("expenses").select("*", { count: "exact" }).eq("clinic_id", clinic.id).eq("status", "pendente");
  if (overdueActive) pendingQuery = pendingQuery.lt("due_date", today);
  const { data: pendingData, count: pendingCount } = await pendingQuery.order("due_date", { ascending: true }).range(pFrom, pTo);
  const pendingExpenses = (pendingData as Expense[]) ?? [];
  const pendingTotalPages = Math.max(1, Math.ceil((pendingCount ?? 0) / DOCS_PAGE_SIZE));

  const paidPage = Math.max(1, parseInt(searchParams.expPaidPage ?? "1", 10) || 1);
  const paFrom = (paidPage - 1) * DOCS_PAGE_SIZE;
  const paTo = paFrom + DOCS_PAGE_SIZE - 1;
  const { data: paidData, count: paidCount } = await supabase
    .from("expenses")
    .select("*", { count: "exact" })
    .eq("clinic_id", clinic.id)
    .eq("status", "pago")
    .gte("paid_at", monthStart)
    .lt("paid_at", monthEnd)
    .order("paid_at", { ascending: false })
    .range(paFrom, paTo);
  const paidExpenses = (paidData as Expense[]) ?? [];
  const paidTotalPages = Math.max(1, Math.ceil((paidCount ?? 0) / DOCS_PAGE_SIZE));

  // Totais — soma em JS a partir de um select só do valor (mesmo padrão de treatment_debits na ficha do paciente).
  let dueAmountsQuery = supabase.from("expenses").select("amount").eq("clinic_id", clinic.id).eq("status", "pendente");
  if (overdueActive) dueAmountsQuery = dueAmountsQuery.lt("due_date", today);
  const { data: dueAmountsData } = await dueAmountsQuery;
  const totalDue = (dueAmountsData ?? []).reduce((sum, e) => sum + Number(e.amount), 0);

  const { data: overdueAmountsData } = await supabase
    .from("expenses")
    .select("amount")
    .eq("clinic_id", clinic.id)
    .eq("status", "pendente")
    .lt("due_date", today);
  const overdueTotal = (overdueAmountsData ?? []).reduce((sum, e) => sum + Number(e.amount), 0);

  const { data: paidAmountsData } = await supabase
    .from("expenses")
    .select("amount")
    .eq("clinic_id", clinic.id)
    .eq("status", "pago")
    .gte("paid_at", monthStart)
    .lt("paid_at", monthEnd);
  const totalPaidThisMonth = (paidAmountsData ?? []).reduce((sum, e) => sum + Number(e.amount), 0);

  // Comparativo com o mês anterior — só muda a janela de `paid_at`.
  const { data: prevMonthAmountsData } = await supabase
    .from("expenses")
    .select("amount")
    .eq("clinic_id", clinic.id)
    .eq("status", "pago")
    .gte("paid_at", prevMonthStart)
    .lt("paid_at", monthStart);
  const totalPaidPrevMonth = (prevMonthAmountsData ?? []).reduce((sum, e) => sum + Number(e.amount), 0);
  const momDeltaPct =
    totalPaidPrevMonth > 0 ? Math.round(((totalPaidThisMonth - totalPaidPrevMonth) / totalPaidPrevMonth) * 100) : null;

  const { data: recurringData } = await supabase
    .from("recurring_expenses")
    .select("*")
    .eq("clinic_id", clinic.id)
    .order("description", { ascending: true });
  const recurringRules = (recurringData as RecurringExpense[]) ?? [];
  const fixedMonthlyCost = recurringRules
    .filter((r) => r.active && r.nature === "fixa")
    .reduce((sum, r) => sum + Number(r.amount), 0);

  const { data: expenseCategoriesData } = await supabase.from("expenses").select("category").eq("clinic_id", clinic.id).not("category", "is", null);
  const usedCategories = new Set<string>(EXPENSE_CATEGORY_SUGGESTIONS);
  (expenseCategoriesData ?? []).forEach((row) => row.category && usedCategories.add(row.category));
  recurringRules.forEach((r) => r.category && usedCategories.add(r.category));
  const categoryOptions = Array.from(usedCategories).sort((a, b) => a.localeCompare(b));

  function monthHrefFor(newMonth: string) {
    const params = new URLSearchParams(currentParams);
    params.set("month", newMonth);
    params.set("expPaidPage", "1");
    return `/dashboard/despesas?${params.toString()}`;
  }

  const exportParams = new URLSearchParams({ ...currentParams, month });
  const exportHref = `/api/clinics/${clinic.id}/expenses/export?${exportParams.toString()}`;

  return (
    <ClinicShell
      clinicName={clinic.name}
      clinicLogoUrl={clinic.logo_url}
      title="Despesas"
      subtitle="Contas fixas e variáveis da clínica, avulsas ou recorrentes"
      role={role}
      userEmail={userEmail}
      userName={userName}
      userAvatarUrl={userAvatarUrl}
      actions={
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <a href={exportHref} className={`${styles.btn} ${styles.btnGhost}`}>
            Exportar CSV
          </a>
          <NewExpenseModal clinicId={clinic.id} categoryOptions={categoryOptions} />
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <ExpensesPanel
          clinicId={clinic.id}
          categoryOptions={categoryOptions}
          initialPendingExpenses={pendingExpenses}
          pendingPage={pendingPage}
          pendingTotalPages={pendingTotalPages}
          pendingCount={pendingCount ?? 0}
          totalDue={totalDue}
          initialPaidExpenses={paidExpenses}
          paidPage={paidPage}
          paidTotalPages={paidTotalPages}
          paidCount={paidCount ?? 0}
          totalPaidThisMonth={totalPaidThisMonth}
          currentParams={currentParams}
          month={month}
          monthLabel={monthLabel}
          todayStr={today}
          overdueTotal={overdueTotal}
          overdueActive={overdueActive}
          fixedMonthlyCost={fixedMonthlyCost}
          momDeltaPct={momDeltaPct}
        />

        <RecurringExpensesPanel clinicId={clinic.id} categoryOptions={categoryOptions} initialRecurring={recurringRules} />
      </div>
    </ClinicShell>
  );
}
