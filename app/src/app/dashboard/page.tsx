import { redirect } from "next/navigation";
import { getClinicAndRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ClinicShell } from "@/components/clinic/ClinicShell";
import { CancelledAppointmentsPanel } from "@/components/dashboard/CancelledAppointmentsPanel";
import { UpcomingReturnsPanel } from "@/components/dashboard/UpcomingReturnsPanel";
import { UnfinishedTreatmentsPanel, type UnfinishedTreatmentGroup } from "@/components/dashboard/UnfinishedTreatmentsPanel";
import { OpenDebitsPanel, type OpenDebitGroup } from "@/components/dashboard/OpenDebitsPanel";
import { DailyAgendaPanel } from "@/components/dashboard/DailyAgendaPanel";
import { brDateOnly, firstOfMonth, firstOfNextMonth } from "@/lib/date";
import { formatMoneyDisplay } from "@/lib/money";
import { DashboardKPIs } from "@/components/dashboard/DashboardKPIs";
import type { Appointment } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

const PAGE_SIZE = 10;
const TOP_GROUPS_LIMIT = 10;

function formatMoney(value: number): string {
  return `R$ ${formatMoneyDisplay(value)}`;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { cancelPage?: string; returnPage?: string };
}) {
  const auth = await getClinicAndRole();
  if (!auth) redirect("/login");
  const { clinic, role, userEmail } = auth;

  const supabase = await createSupabaseServerClient();
  const professionalName = clinic.dentist_name || clinic.name;
  const todayDate = brDateOnly();

  const cancelPage = Math.max(1, parseInt(searchParams.cancelPage ?? "1", 10) || 1);
  const cancelFrom = (cancelPage - 1) * PAGE_SIZE;
  const cancelTo = cancelFrom + PAGE_SIZE - 1;

  const returnPage = Math.max(1, parseInt(searchParams.returnPage ?? "1", 10) || 1);
  const returnFrom = (returnPage - 1) * PAGE_SIZE;
  const returnTo = returnFrom + PAGE_SIZE - 1;

  // "Agenda de Hoje"
  const startOfToday = `${todayDate}T00:00:00-03:00`;
  const endOfToday = `${todayDate}T23:59:59-03:00`;
  
  const { data: todayAppointmentsData } = await supabase
    .from("appointments")
    .select("*")
    .eq("clinic_id", clinic.id)
    .gte("scheduled_at", startOfToday)
    .lte("scheduled_at", endOfToday)
    .order("scheduled_at", { ascending: true });
    
  const todayAppointments = (todayAppointmentsData as Appointment[]) ?? [];

  // "Consultas canceladas" — mais recente pro mais antigo. Não existe uma
  // coluna dedicada de "cancelado_em"; `updated_at` é atualizado junto com o
  // status, então é o sinal mais próximo do momento do cancelamento.
  const { data: cancelledData, count: cancelledCount } = await supabase
    .from("appointments")
    .select("*", { count: "exact" })
    .eq("clinic_id", clinic.id)
    .in("status", ["cancelado_paciente", "cancelado_dentista"])
    .is("cancellation_dismissed_at", null)
    .order("updated_at", { ascending: false })
    .range(cancelFrom, cancelTo);
  const cancelledAppointments = (cancelledData as Appointment[]) ?? [];
  const cancelledTotalPages = Math.max(1, Math.ceil((cancelledCount ?? 0) / PAGE_SIZE));

  // "Retornos próximos" — do retorno mais próximo pro mais antigo (atrasados primeiro).
  const { data: returnsData, count: returnsCount } = await supabase
    .from("appointments")
    .select("*", { count: "exact" })
    .eq("clinic_id", clinic.id)
    .not("return_due_date", "is", null)
    .is("return_dismissed_at", null)
    .order("return_due_date", { ascending: true })
    .range(returnFrom, returnTo);
  const upcomingReturns = (returnsData as Appointment[]) ?? [];
  const returnsTotalPages = Math.max(1, Math.ceil((returnsCount ?? 0) / PAGE_SIZE));

  // Balanço do mês — só o mês corrente nessa primeira versão, sem seletor de mês.
  const monthStart = firstOfMonth(todayDate);
  const monthEnd = firstOfNextMonth(todayDate);

  const { data: revenueData } = await supabase
    .from("treatment_debits")
    .select("amount")
    .eq("clinic_id", clinic.id)
    .eq("status", "pago")
    .gte("paid_at", monthStart)
    .lt("paid_at", monthEnd);
  const monthlyRevenue = (revenueData ?? []).reduce((sum, d) => sum + Number(d.amount), 0);

  const { data: expenseData } = await supabase
    .from("expenses")
    .select("amount")
    .eq("clinic_id", clinic.id)
    .eq("status", "pago")
    .gte("paid_at", monthStart)
    .lt("paid_at", monthEnd);
  const monthlyExpense = (expenseData ?? []).reduce((sum, e) => sum + Number(e.amount), 0);
  const monthlyBalance = monthlyRevenue - monthlyExpense;

  // Balanço do dia
  const dayStart = startOfToday;
  const dayEnd = endOfToday;

  const { data: dailyRevenueData } = await supabase
    .from("treatment_debits")
    .select("amount")
    .eq("clinic_id", clinic.id)
    .eq("status", "pago")
    .gte("paid_at", dayStart)
    .lte("paid_at", dayEnd);
  const dailyRevenue = (dailyRevenueData ?? []).reduce((sum, d) => sum + Number(d.amount), 0);

  const { data: dailyExpenseData } = await supabase
    .from("expenses")
    .select("amount")
    .eq("clinic_id", clinic.id)
    .eq("status", "pago")
    .gte("paid_at", dayStart)
    .lte("paid_at", dayEnd);
  const dailyExpense = (dailyExpenseData ?? []).reduce((sum, e) => sum + Number(e.amount), 0);
  const dailyBalance = dailyRevenue - dailyExpense;

  // Pacientes com tratamento em aberto e com débito em aberto — agrupado em JS
  // (poucos registros na prática, não compensa uma view/RPC só pra isso).
  const { data: unfinishedData } = await supabase
    .from("treatments")
    .select("patient_id, created_at")
    .eq("clinic_id", clinic.id)
    .eq("status", "aberto")
    .order("created_at", { ascending: true });

  const unfinishedByPatient = new Map<string, { count: number; oldestCreatedAt: string }>();
  for (const t of unfinishedData ?? []) {
    const existing = unfinishedByPatient.get(t.patient_id);
    if (existing) existing.count += 1;
    else unfinishedByPatient.set(t.patient_id, { count: 1, oldestCreatedAt: t.created_at });
  }
  const unfinishedTop = Array.from(unfinishedByPatient.entries())
    .sort((a, b) => a[1].oldestCreatedAt.localeCompare(b[1].oldestCreatedAt))
    .slice(0, TOP_GROUPS_LIMIT);

  const { data: openDebitsData } = await supabase
    .from("treatment_debits")
    .select("patient_id, amount")
    .eq("clinic_id", clinic.id)
    .eq("status", "aberto");

  const debitsByPatient = new Map<string, { count: number; total: number }>();
  for (const d of openDebitsData ?? []) {
    const existing = debitsByPatient.get(d.patient_id);
    if (existing) {
      existing.count += 1;
      existing.total += Number(d.amount);
    } else {
      debitsByPatient.set(d.patient_id, { count: 1, total: Number(d.amount) });
    }
  }
  const openDebitsTop = Array.from(debitsByPatient.entries())
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, TOP_GROUPS_LIMIT);

  const patientIds = Array.from(new Set([...unfinishedTop.map(([id]) => id), ...openDebitsTop.map(([id]) => id)]));
  const { data: patientsData } =
    patientIds.length > 0 ? await supabase.from("patients").select("id, name").in("id", patientIds) : { data: [] };
  const patientNameById = new Map((patientsData ?? []).map((p) => [p.id, p.name]));

  const unfinishedGroups: UnfinishedTreatmentGroup[] = unfinishedTop.map(([patientId, v]) => ({
    patientId,
    patientName: patientNameById.get(patientId) ?? "Paciente",
    count: v.count,
    oldestCreatedAt: v.oldestCreatedAt,
  }));

  const openDebitGroups: OpenDebitGroup[] = openDebitsTop.map(([patientId, v]) => ({
    patientId,
    patientName: patientNameById.get(patientId) ?? "Paciente",
    count: v.count,
    total: v.total,
  }));

  return (
    <ClinicShell
      clinicName={clinic.name}
      clinicLogoUrl={clinic.logo_url}
      title="Dashboard"
      subtitle="Cancelamentos e retornos que precisam de um contato"
      role={role}
      userEmail={userEmail}
    >
      {role === "owner" && (
        <DashboardKPIs
          monthlyRevenue={monthlyRevenue}
          monthlyExpense={monthlyExpense}
          monthlyBalance={monthlyBalance}
          dailyRevenue={dailyRevenue}
          dailyExpense={dailyExpense}
          dailyBalance={dailyBalance}
        />
      )}

      <DailyAgendaPanel
        clinicId={clinic.id}
        appointments={todayAppointments}
        professionalName={professionalName}
        todayDate={todayDate}
      />

      <UpcomingReturnsPanel
        clinicId={clinic.id}
        professionalName={professionalName}
        todayDate={todayDate}
        items={upcomingReturns}
        page={returnPage}
        totalPages={returnsTotalPages}
        count={returnsCount ?? 0}
        otherPageParam="cancelPage"
        otherPageValue={cancelPage}
      />

      <CancelledAppointmentsPanel
        clinicId={clinic.id}
        professionalName={professionalName}
        todayDate={todayDate}
        items={cancelledAppointments}
        page={cancelPage}
        totalPages={cancelledTotalPages}
        count={cancelledCount ?? 0}
        otherPageParam="returnPage"
        otherPageValue={returnPage}
      />

      <UnfinishedTreatmentsPanel groups={unfinishedGroups} />
      <OpenDebitsPanel groups={openDebitGroups} />
    </ClinicShell>
  );
}
