"use client";

import { AppointmentStatusBadge, UrgentBadge } from "@/components/AppointmentStatusBadge";
import { AppointmentActions } from "@/components/AppointmentActions";
import { AppointmentNotesField } from "@/components/dashboard/AppointmentNotesField";
import { OpenTreatmentsSummary } from "@/components/dashboard/OpenTreatmentsSummary";
import { PatientAvatar } from "@/components/PatientAvatar";
import { formatBRDate, formatBRDateTime, formatBRTime } from "@/lib/date";
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
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "8px 0" }}>
      <span style={{ color: "var(--ink-soft)", fontSize: 13.5 }}>{label}</span>
      <span style={{ fontSize: 13.5, textAlign: "right", color: "var(--ink)" }}>{value}</span>
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
  onChanged,
  hideActionsCard,
}: {
  clinicId: string;
  appointment: Appointment;
  events: AppointmentEvent[];
  /** Usado dentro do modal — o wrapper lá já espaça os cards por `gap`, então
   * cancela o `margin-bottom` próprio do `.panel` (senão soma os dois e
   * sobra espaço em branco entre os cards). */
  compact?: boolean;
  /** Ver AppointmentActions — só o modal client-fetched (fora da agenda) precisa. */
  onChanged?: () => void;
  /** Modais de detalhe renderizam as ações como barra fixa no topo (fora
   * daqui, ver AppointmentDetailModal/DetailModalShell) — evita duplicar o
   * card "Ações" no meio da lista que rola. A página cheia não usa isso. */
  hideActionsCard?: boolean;
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
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 14, marginBottom: 8 }}>
            <div
                style={{ display: "flex", alignItems: "center", gap: 12, cursor: a.patient_id ? "pointer" : "default" }}
                onClick={() => { if (a.patient_id) window.location.href = `/dashboard/pacientes/${a.patient_id}`; }}
              >
              <PatientAvatar clinicId={clinicId} patientId={a.patient_id} name={a.patient_name} size={52} />
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, textDecoration: a.patient_id ? "none" : undefined, transition: "color 0.15s" }}
                  onMouseEnter={(e) => { if (a.patient_id) e.currentTarget.style.color = "var(--brand)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = ""; }}
                >{a.patient_name}</div>
                <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>+55 {formatBRPhoneLocal(a.patient_phone)}</div>
                <OpenTreatmentsSummary clinicId={clinicId} patientId={a.patient_id} />
              </div>
            </div>
            
            <div style={{ display: "flex", gap: 8 }}>
              {/* Círculo de Data */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: 52, height: 52, borderRadius: "50%", background: "var(--surface-sunken)", color: "var(--ink)", flexShrink: 0 }}>
                <span style={{ fontSize: 13.5, fontWeight: 700 }}>
                  {formatBRDate(a.scheduled_at).substring(0, 5)}
                </span>
              </div>
              {/* Círculo de Horário */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: 52, height: 52, borderRadius: "50%", background: "var(--surface-sunken)", color: "var(--ink)", flexShrink: 0 }}>
                <span style={{ fontSize: 13.5, fontWeight: 700 }}>
                  {formatBRTime(a.scheduled_at)}
                </span>
              </div>
              {/* Círculo de Duração */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: 52, height: 52, borderRadius: "50%", background: "var(--surface-sunken)", color: "var(--ink)", flexShrink: 0 }}>
                <span style={{ fontSize: 13.5, fontWeight: 700 }}>
                  {a.duration_minutes} min
                </span>
              </div>
            </div>
          </div>
          {!a.patient_id && (
            <div style={{ padding: "8px 0" }}>
              <span style={{ fontSize: 12.5, color: "var(--ink-faint)" }}>
                Ainda não é paciente cadastrado nesta clínica.
              </span>
            </div>
          )}
          {a.return_due_date &&
            detailRow(
              "Retorno previsto",
              `${formatBRDate(`${a.return_due_date}T12:00:00-03:00`)}${a.return_notified_at ? " — lembrete já enviado" : ""}`
            )}
          <AppointmentNotesField clinicId={clinicId} appointmentId={a.id} notes={a.notes} onChanged={onChanged} />
        </div>
      </div>

      {!hideActionsCard && (
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
              hasPhone={!!a.patient_phone}
              onChanged={onChanged}
            />
          </div>
        </div>
      )}

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
