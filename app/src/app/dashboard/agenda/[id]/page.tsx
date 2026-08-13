import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ClinicShell } from "@/components/clinic/ClinicShell";
import { AppointmentStatusBadge, UrgentBadge } from "@/components/AppointmentStatusBadge";
import { AppointmentActions } from "@/components/AppointmentActions";
import { PatientAvatar } from "@/components/PatientAvatar";
import { formatBRDate, formatBRDateTime } from "@/lib/date";
import { formatBRPhoneLocal } from "@/lib/validation";
import type { Appointment, AppointmentEvent } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

const EVENT_LABEL: Record<string, (e: AppointmentEvent) => string> = {
  created: () => "Agendamento criado",
  status_changed: (e) => `Status alterado para "${e.to_status}"`,
  rescheduled: () => "Remarcado",
};

const ACTOR_LABEL: Record<string, string> = {
  recepcao: "recepção/clínica",
  paciente: "paciente",
  sistema: "sistema",
};

function detailRow(label: string, value: React.ReactNode) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
      <span style={{ color: "var(--ink-soft)", fontSize: 13.5 }}>{label}</span>
      <span style={{ fontSize: 13.5, textAlign: "right" }}>{value}</span>
    </div>
  );
}

export default async function AppointmentDetailPage({ params }: { params: { id: string } }) {
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
    <ClinicShell
      clinicName={clinic.name}
      clinicLogoUrl={clinic.logo_url}
      title="Agendamento"
      actions={
        <Link href="/dashboard/agenda" className={`${styles.btn} ${styles.btnGhost}`}>
          ← Voltar
        </Link>
      }
    >
      <div className={styles.narrowContent}>
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <p className={styles.panelHeaderTitle}>Agendamento</p>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <AppointmentStatusBadge status={a.status} />
              {a.urgent && <UrgentBadge />}
            </div>
          </div>
          <div className={styles.panelBody}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 14, marginBottom: 4, borderBottom: "1px solid var(--line)" }}>
              <PatientAvatar clinicId={clinic.id} patientId={a.patient_id} name={a.patient_name} size={52} />
              <div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{a.patient_name}</div>
                <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>+55 {formatBRPhoneLocal(a.patient_phone)}</div>
              </div>
            </div>
            {!a.patient_id && (
              <div style={{ padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
                <span style={{ fontSize: 12.5, color: "var(--ink-faint)" }}>
                  Ainda não é paciente cadastrado nesta clínica.
                </span>
              </div>
            )}
            {detailRow("Profissional", a.professional_name)}
            {detailRow("Data e horário", formatBRDateTime(a.scheduled_at, "medium"))}
            {detailRow("Duração", `${a.duration_minutes} min`)}
            {a.return_due_date &&
              detailRow(
                "Retorno previsto",
                `${formatBRDate(`${a.return_due_date}T12:00:00-03:00`)}${a.return_notified_at ? " — lembrete já enviado" : ""}`
              )}
            {a.notes && detailRow("Observação", a.notes)}
          </div>
        </div>

        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <p className={styles.panelHeaderTitle}>Ações</p>
          </div>
          <div className={styles.panelBody}>
            <AppointmentActions
              clinicId={clinic.id}
              appointmentId={a.id}
              status={a.status}
              urgent={a.urgent}
              scheduledAt={a.scheduled_at}
              durationMinutes={a.duration_minutes}
            />
          </div>
        </div>

        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <p className={styles.panelHeaderTitle}>Histórico</p>
          </div>
          <div className={styles.panelBody}>
            {events.length === 0 ? (
              <p style={{ color: "var(--ink-soft)", fontSize: 13.5, margin: 0 }}>Sem eventos registrados ainda.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {events.map((e) => (
                  <div key={e.id} style={{ fontSize: 13, color: "var(--ink-soft)" }}>
                    <strong style={{ color: "var(--ink)" }}>{(EVENT_LABEL[e.event_type] ?? (() => e.event_type))(e)}</strong>
                    {" — "}
                    {formatBRDateTime(e.created_at, "medium")} · {ACTOR_LABEL[e.actor] ?? e.actor}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </ClinicShell>
  );
}
