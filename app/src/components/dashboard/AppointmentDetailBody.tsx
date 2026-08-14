import { AppointmentStatusBadge, UrgentBadge } from "@/components/AppointmentStatusBadge";
import { AppointmentActions } from "@/components/AppointmentActions";
import { AppointmentNotesField } from "@/components/dashboard/AppointmentNotesField";
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

/**
 * Conteúdo do detalhe de agendamento, sem a moldura ao redor — reaproveitado
 * pela página cheia (`/dashboard/agenda/[id]`, acesso direto/F5/link
 * compartilhado) e pelo modal (`@modal/(.)[id]`, aberto por cima da agenda
 * ao navegar de dentro dela). Uma única fonte de verdade pro layout do
 * detalhe, em vez de duas versões que podem divergir.
 */
export function AppointmentDetailBody({
  clinicId,
  appointment: a,
  events,
  compact,
}: {
  clinicId: string;
  appointment: Appointment;
  events: AppointmentEvent[];
  /** Usado dentro do modal — o wrapper lá já espaça os cards por `gap`, então
   * cancela o `margin-bottom` próprio do `.panel` (senão soma os dois e
   * sobra espaço em branco entre os cards). */
  compact?: boolean;
}) {
  const panelStyle = compact ? { marginBottom: 0 } : undefined;
  return (
    <>
      <div className={styles.panel} style={panelStyle}>
        <div className={styles.panelHeader}>
          <p className={styles.panelHeaderTitle}>Agendamento</p>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <AppointmentStatusBadge status={a.status} />
            {a.urgent && <UrgentBadge />}
          </div>
        </div>
        <div className={styles.panelBody}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 14, marginBottom: 4, borderBottom: "1px solid var(--line)" }}>
            <PatientAvatar clinicId={clinicId} patientId={a.patient_id} name={a.patient_name} size={52} />
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
          <AppointmentNotesField clinicId={clinicId} appointmentId={a.id} notes={a.notes} />
        </div>
      </div>

      <div className={styles.panel} style={panelStyle}>
        <div className={styles.panelHeader}>
          <p className={styles.panelHeaderTitle}>Ações</p>
        </div>
        <div className={styles.panelBody}>
          <AppointmentActions
            clinicId={clinicId}
            appointmentId={a.id}
            patientId={a.patient_id}
            status={a.status}
            urgent={a.urgent}
            scheduledAt={a.scheduled_at}
            durationMinutes={a.duration_minutes}
          />
        </div>
      </div>

      <div className={styles.panel} style={panelStyle}>
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
    </>
  );
}
