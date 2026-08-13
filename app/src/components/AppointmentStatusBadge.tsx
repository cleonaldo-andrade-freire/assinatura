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
 * Nunca reaproveita cor de status, de propósito — textura (borda tracejada)
 * + ícone + texto, três sinais redundantes que não dependem de matiz.
 */
export function UrgentBadge() {
  return (
    <span className={styles.urgentBadge}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 3L22 20H2L12 3z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <path d="M12 10v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="12" cy="17" r="1" fill="currentColor" />
      </svg>
      Urgente
    </span>
  );
}
