import { redirect } from "next/navigation";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ClinicShell } from "@/components/clinic/ClinicShell";
import { CancelledAppointmentsPanel } from "@/components/dashboard/CancelledAppointmentsPanel";
import { UpcomingReturnsPanel } from "@/components/dashboard/UpcomingReturnsPanel";
import { brDateOnly } from "@/lib/date";
import type { Appointment } from "@/lib/database.types";

const PAGE_SIZE = 10;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { cancelPage?: string; returnPage?: string };
}) {
  const clinic = await getCurrentClinic();
  if (!clinic) redirect("/login");

  const supabase = await createSupabaseServerClient();
  const professionalName = clinic.dentist_name || clinic.name;
  const todayDate = brDateOnly();

  const cancelPage = Math.max(1, parseInt(searchParams.cancelPage ?? "1", 10) || 1);
  const cancelFrom = (cancelPage - 1) * PAGE_SIZE;
  const cancelTo = cancelFrom + PAGE_SIZE - 1;

  const returnPage = Math.max(1, parseInt(searchParams.returnPage ?? "1", 10) || 1);
  const returnFrom = (returnPage - 1) * PAGE_SIZE;
  const returnTo = returnFrom + PAGE_SIZE - 1;

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

  return (
    <ClinicShell
      clinicName={clinic.name}
      clinicLogoUrl={clinic.logo_url}
      title="Dashboard"
      subtitle="Cancelamentos e retornos que precisam de um contato"
    >
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
    </ClinicShell>
  );
}
