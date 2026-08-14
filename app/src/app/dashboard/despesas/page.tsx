import { redirect } from "next/navigation";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ClinicShell } from "@/components/clinic/ClinicShell";
import { ExpensesPanel } from "@/components/expenses/ExpensesPanel";
import { RecurringExpensesPanel } from "@/components/expenses/RecurringExpensesPanel";
import { EXPENSE_CATEGORY_SUGGESTIONS } from "@/lib/expenseCategories";
import { firstOfMonth, firstOfNextMonth, brDateOnly } from "@/lib/date";
import type { Expense, RecurringExpense } from "@/lib/database.types";

const DOCS_PAGE_SIZE = 5;

export default async function DespesasPage({
  searchParams,
}: {
  searchParams: { expPage?: string; expPaidPage?: string };
}) {
  const clinic = await getCurrentClinic();
  if (!clinic) redirect("/login");

  const supabase = await createSupabaseServerClient();
  const today = brDateOnly();
  const monthStart = firstOfMonth(today);
  const monthEnd = firstOfNextMonth(today);

  const pendingPage = Math.max(1, parseInt(searchParams.expPage ?? "1", 10) || 1);
  const pFrom = (pendingPage - 1) * DOCS_PAGE_SIZE;
  const pTo = pFrom + DOCS_PAGE_SIZE - 1;
  const { data: pendingData, count: pendingCount } = await supabase
    .from("expenses")
    .select("*", { count: "exact" })
    .eq("clinic_id", clinic.id)
    .eq("status", "pendente")
    .order("due_date", { ascending: true })
    .range(pFrom, pTo);
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
  const { data: dueAmountsData } = await supabase.from("expenses").select("amount").eq("clinic_id", clinic.id).eq("status", "pendente");
  const totalDue = (dueAmountsData ?? []).reduce((sum, e) => sum + Number(e.amount), 0);

  const { data: paidAmountsData } = await supabase
    .from("expenses")
    .select("amount")
    .eq("clinic_id", clinic.id)
    .eq("status", "pago")
    .gte("paid_at", monthStart)
    .lt("paid_at", monthEnd);
  const totalPaidThisMonth = (paidAmountsData ?? []).reduce((sum, e) => sum + Number(e.amount), 0);

  const { data: recurringData } = await supabase
    .from("recurring_expenses")
    .select("*")
    .eq("clinic_id", clinic.id)
    .order("description", { ascending: true });
  const recurring = (recurringData as RecurringExpense[]) ?? [];

  const { data: expenseCategoriesData } = await supabase.from("expenses").select("category").eq("clinic_id", clinic.id).not("category", "is", null);
  const usedCategories = new Set<string>(EXPENSE_CATEGORY_SUGGESTIONS);
  (expenseCategoriesData ?? []).forEach((row) => row.category && usedCategories.add(row.category));
  recurring.forEach((r) => r.category && usedCategories.add(r.category));
  const categoryOptions = Array.from(usedCategories).sort((a, b) => a.localeCompare(b));

  return (
    <ClinicShell
      clinicName={clinic.name}
      clinicLogoUrl={clinic.logo_url}
      title="Despesas"
      subtitle="Contas fixas e variáveis da clínica, avulsas ou recorrentes"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
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
        />

        <RecurringExpensesPanel clinicId={clinic.id} categoryOptions={categoryOptions} initialRecurring={recurring} />
      </div>
    </ClinicShell>
  );
}
