import { notFound, redirect } from "next/navigation";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DetailModalShell } from "@/components/dashboard/DetailModalShell";
import { AppointmentDetailBody } from "@/components/dashboard/AppointmentDetailBody";
import { AppointmentActions } from "@/components/AppointmentActions";
import type { Appointment, AppointmentEvent } from "@/lib/database.types";

/**
 * Intercepta `/dashboard/agenda/[id]` quando a navegação parte de dentro da
 * própria agenda (semana/dia/mês) — abre como modal por cima da grade em
 * vez de trocar de página. Acesso direto ou F5 continua caindo na página
 * cheia (`agenda/[id]/page.tsx`), fora do alcance da interceptação.
 */
export default async function AppointmentDetailModal({ params }: { params: { id: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic) redirect("/login");

  const supabase = await createSupabaseServerClient();
  const { data: appointment } = await supabase
    .from("appointments")
    .select("*")
    .eq("id", params.id)
    .eq("clinic_id", clinic.id)
    .maybeSingle();
  if (!appointment) notFound();
  const a = appointment as Appointment;

  const { data: eventsData } = await supabase
    .from("appointment_events")
    .select("*")
    .eq("appointment_id", a.id)
    .order("created_at", { ascending: false });
  const events = (eventsData as AppointmentEvent[]) ?? [];

  return (
    <DetailModalShell
      title="Agendamento"
      actions={
        <AppointmentActions
          clinicId={clinic.id}
          appointmentId={a.id}
          patientId={a.patient_id}
          status={a.status}
          urgent={a.urgent}
          scheduledAt={a.scheduled_at}
          durationMinutes={a.duration_minutes}
        />
      }
    >
      <AppointmentDetailBody clinicId={clinic.id} appointment={a} events={events} compact hideActionsCard />
    </DetailModalShell>
  );
}
