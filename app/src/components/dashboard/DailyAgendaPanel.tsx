"use client";

import { useState } from "react";
import { formatBRTime } from "@/lib/date";
import type { Appointment } from "@/lib/database.types";
import { PatientAvatar } from "@/components/PatientAvatar";
import { AppointmentStatusBadge } from "@/components/AppointmentStatusBadge";
import { AppointmentDetailModal } from "@/components/dashboard/AppointmentDetailModal";
import { NewAppointmentTrigger } from "@/components/NewAppointmentTrigger";
import styles from "@/styles/shell.module.css";

function getCardColors(status: string) {
  switch (status) {
    case "confirmado": return { bg: "var(--brand-tint)", border: "var(--brand-faint)", borderHover: "var(--brand)", circleBg: "var(--surface)" };
    case "em_atendimento": return { bg: "var(--attending-tint)", border: "var(--attending-faint)", borderHover: "var(--attending)", circleBg: "var(--surface)" };
    case "cancelado_paciente":
    case "cancelado_dentista":
    case "faltou": return { bg: "var(--danger-tint)", border: "var(--danger-faint)", borderHover: "var(--danger)", circleBg: "var(--surface)" };
    case "atendido": return { bg: "var(--sign-tint)", border: "var(--sign-line, var(--sign-faint, var(--sign-tint)))", borderHover: "var(--sign)", circleBg: "var(--surface)" };
    case "agendado": return { bg: "var(--surface-sunken)", border: "var(--line)", borderHover: "var(--ink-soft)", circleBg: "var(--surface)" };
    default: return { bg: "var(--surface)", border: "var(--line)", borderHover: "var(--line-strong)", circleBg: "var(--surface-sunken)" };
  }
}

export function DailyAgendaPanel({
  clinicId,
  professionalName,
  todayDate,
  appointments,
}: {
  clinicId: string;
  professionalName: string;
  todayDate: string;
  appointments: Appointment[];
}) {
  const [openDetailId, setOpenDetailId] = useState<string | null>(null);

  if (appointments.length === 0) {
    return (
      <div className={styles.panel}>
        <div className={styles.panelHeader} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <p className={styles.panelHeaderTitle}>Agenda de Hoje</p>
          <NewAppointmentTrigger
            clinicId={clinicId}
            professionalName={professionalName}
            date={todayDate}
            className={`${styles.btn} ${styles.btnPrimary}`}
          >
            + Novo agendamento
          </NewAppointmentTrigger>
        </div>
        <div className={styles.emptyState}>
          <p className={styles.emptyMessage}>Nenhum agendamento para hoje.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={styles.panel}>
        <div className={styles.panelHeader} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <p className={styles.panelHeaderTitle}>Agenda de Hoje</p>
            <span style={{ fontSize: "14px", color: "var(--ink-soft)" }}>{appointments.length} {appointments.length === 1 ? "consulta" : "consultas"}</span>
          </div>
          <NewAppointmentTrigger
            clinicId={clinicId}
            professionalName={professionalName}
            date={todayDate}
            className={`${styles.btn} ${styles.btnPrimary}`}
          >
            + Novo agendamento
          </NewAppointmentTrigger>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12, padding: "16px 20px" }}>
          {appointments.map((app) => {
            const colors = getCardColors(app.status);
            return (
            <div
              key={app.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 14px",
                border: `1px solid ${colors.border}`,
                borderRadius: "var(--radius-md)",
                background: colors.bg,
                cursor: "pointer",
                boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = colors.borderHover;
                e.currentTarget.style.boxShadow = "0 3px 8px rgba(0,0,0,0.06)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = colors.border;
                e.currentTarget.style.boxShadow = "0 1px 2px rgba(0,0,0,0.02)";
              }}
              onClick={() => setOpenDetailId(app.id)}
            >
              <PatientAvatar clinicId={clinicId} patientId={app.patient_id} name={app.patient_name} size={42} />
              
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {app.patient_name || "Paciente sem nome"}
                </div>
                <div style={{ display: "flex", alignItems: "center" }}>
                  <AppointmentStatusBadge status={app.status} />
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, borderRadius: "50%", background: colors.circleBg, color: "var(--ink)", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                {formatBRTime(app.scheduled_at)}
              </div>
            </div>
          )})}
        </div>
      </div>

      {openDetailId && (
        <AppointmentDetailModal
          open={true}
          onClose={() => setOpenDetailId(null)}
          clinicId={clinicId}
          appointmentId={openDetailId}
        />
      )}
    </>
  );
}
