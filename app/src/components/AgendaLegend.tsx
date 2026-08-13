import { APPOINTMENT_STATUS_DOT_COLOR, APPOINTMENT_STATUS_LABEL, APPOINTMENT_STATUS_SYMBOL } from "@/lib/appointments";
import type { AppointmentStatus } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

// Cancelado por paciente/clínica cai na mesma cor e símbolo — a legenda
// mostra uma linha só ("Cancelado") em vez de repetir a mesma explicação
// duas vezes.
const LEGEND_STATUSES: AppointmentStatus[] = ["agendado", "confirmado", "cancelado_paciente", "atendido"];

/**
 * A grade semanal e o resumo mensal (desktop) comunicam status só por cor —
 * o chip/ponto é pequeno demais pra rótulo por extenso, ao contrário da
 * lista diária do celular, que já tem `AppointmentStatusBadge` com texto.
 * Esta legenda é o canal redundante que cobre a mesma exigência de "nunca
 * só cor" nas duas visões de desktop.
 */
export function AgendaLegend() {
  return (
    <div className={styles.agendaLegend}>
      {LEGEND_STATUSES.map((status) => (
        <span key={status} className={styles.agendaLegendItem}>
          <span className={styles.agendaLegendSymbol} style={{ color: APPOINTMENT_STATUS_DOT_COLOR[status] }}>
            {APPOINTMENT_STATUS_SYMBOL[status]}
          </span>
          {status === "cancelado_paciente" ? "Cancelado" : APPOINTMENT_STATUS_LABEL[status]}
        </span>
      ))}
      <span className={styles.agendaLegendItem}>
        <span className={styles.agendaLegendSymbol} style={{ color: "var(--urgent)" }}>
          ▲
        </span>
        Urgente
      </span>
    </div>
  );
}
