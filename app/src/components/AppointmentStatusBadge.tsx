import { APPOINTMENT_STATUS_CLASS, APPOINTMENT_STATUS_LABEL } from "@/lib/appointments";
import type { AppointmentStatus } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

export function AppointmentStatusBadge({ status }: { status: AppointmentStatus }) {
  return (
    <span className={`${styles.statusBadge} ${styles[APPOINTMENT_STATUS_CLASS[status]]}`}>
      {APPOINTMENT_STATUS_LABEL[status]}
    </span>
  );
}

/**
 * Nunca reaproveita cor de status, de propósito — cor própria (violeta,
 * longe dos 4 tons de status) + ícone + texto, redundantes entre si.
 */
export function UrgentBadge() {
  return (
    <span className={styles.urgentBadge}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 3L22 20H2L12 3z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <path d="M12 10v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="12" cy="17" r="1" fill="currentColor" />
      </svg>
      Urgência
    </span>
  );
}

/**
 * "Sem resposta" — reforça o próprio status `agendado` (mesma cor âmbar),
 * não é um estado novo: só chama atenção de que a consulta está perto e
 * ainda sem confirmação, pra recepção ligar como último recurso.
 */
export function NeedsFollowUpBadge() {
  return (
    <span className={`${styles.statusBadge} ${styles.statusWarn}`}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ marginRight: 2 }}>
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
        <path d="M12 7v5l3.5 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      Sem resposta
    </span>
  );
}
