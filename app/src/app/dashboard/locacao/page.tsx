import { notFound, redirect } from "next/navigation";
import { getClinicAndRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ClinicShell } from "@/components/clinic/ClinicShell";
import { RoomRentalClient } from "@/components/locacao/RoomRentalClient";
import { loadShifts } from "@/lib/roomRentalServer";
import { addDaysToDateStr, brDateOnly, brDayRangeUtc, mondayOfWeek } from "@/lib/date";
import type { RoomRental, RoomTenant } from "@/lib/database.types";

/** Locação da sala por turno (migration 073) — só para clínica com o módulo
 * ligado e papel `owner` (mexe com valores, como o Financeiro). */
export default async function LocacaoPage({ searchParams }: { searchParams: { semana?: string; aba?: string } }) {
  const auth = await getClinicAndRole();
  if (!auth) redirect("/login");
  if (auth.role !== "owner") redirect("/dashboard");
  const { clinic, role, userEmail, userName, userAvatarUrl } = auth;
  if (!clinic.room_rental_enabled) notFound();

  const today = brDateOnly();
  const weekStart = mondayOfWeek(/^\d{4}-\d{2}-\d{2}$/.test(searchParams.semana ?? "") ? (searchParams.semana as string) : today);
  const days = Array.from({ length: 7 }, (_, i) => addDaysToDateStr(weekStart, i));
  const { fromIso } = brDayRangeUtc(days[0]);
  const { toIso } = brDayRangeUtc(days[6]);
  const tab = searchParams.aba === "locatarios" || searchParams.aba === "turnos" ? searchParams.aba : "quadro";

  const supabase = await createSupabaseServerClient();
  const [shifts, { data: tenantsData }, { data: weekRentalsData }, { data: appointmentsData }, { data: receivableData }] = await Promise.all([
    loadShifts(supabase, clinic.id),
    supabase.from("room_tenants").select("*").eq("clinic_id", clinic.id).order("name"),
    supabase
      .from("room_rentals")
      .select("*")
      .eq("clinic_id", clinic.id)
      .eq("status", "agendada")
      .gte("rental_date", days[0])
      .lte("rental_date", days[6]),
    // Só o horário — o quadro mostra "ocupado pela clínica", nunca o paciente.
    supabase
      .from("appointments")
      .select("scheduled_at, ends_at")
      .eq("clinic_id", clinic.id)
      .not("status", "in", "(cancelado_paciente,cancelado_dentista)")
      .gte("scheduled_at", fromIso)
      .lt("scheduled_at", toIso),
    supabase
      .from("room_rentals")
      .select("*")
      .eq("clinic_id", clinic.id)
      .eq("status", "agendada")
      .is("paid_at", null)
      .lte("rental_date", today)
      .order("rental_date"),
  ]);

  return (
    <ClinicShell
      clinicName={clinic.name}
      clinicLogoUrl={clinic.logo_url}
      title="Locação da sala"
      subtitle="Turnos alugados para outros profissionais — cobrança depois do uso"
      role={role}
      userEmail={userEmail}
      userName={userName}
      userAvatarUrl={userAvatarUrl}
    >
      <RoomRentalClient
        clinicId={clinic.id}
        tab={tab}
        today={today}
        weekStart={weekStart}
        days={days}
        shifts={shifts}
        tenants={(tenantsData as RoomTenant[]) ?? []}
        weekRentals={(weekRentalsData as RoomRental[]) ?? []}
        appointments={appointmentsData ?? []}
        receivableRentals={(receivableData as RoomRental[]) ?? []}
      />
    </ClinicShell>
  );
}
