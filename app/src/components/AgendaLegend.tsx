import { APPOINTMENT_STATUS_DOT_COLOR, APPOINTMENT_STATUS_LABEL } from "@/lib/appointments";
import type { AppointmentStatus } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

// Cancelado por paciente/clínica cai na mesma cor — a legenda mostra uma
// linha só ("Cancelado") em vez de repetir a mesma explicação duas vezes.
const LEGEND_STATUSES: AppointmentStatus[] = [
  "agendado",
  "confirmado",
  "em_atendimento",
  "atendido",
  "cancelado_paciente",
  "faltou",
];

// Mesma cor que o bloco sólido da grade usa de verdade (ver .agendaWeekChip
// em shell.module.css) — "agendado" usa --muted-fill ali (mais escuro, pro
// texto branco em cima manter contraste), não o --ink-soft mais claro que
// APPOINTMENT_STATUS_DOT_COLOR usa pro pontinho de outros lugares. Sem isso
// a legenda mostrava uma cor que não batia com o que aparece na grade.
const SWATCH_COLOR: Record<AppointmentStatus, string> = {
  ...APPOINTMENT_STATUS_DOT_COLOR,
  agendado: "var(--muted-fill)",
};

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
          <span className={styles.agendaLegendSwatch} style={{ background: SWATCH_COLOR[status] }} />
          {status === "cancelado_paciente" ? "Cancelado" : APPOINTMENT_STATUS_LABEL[status]}
        </span>
      ))}
      <span className={styles.agendaLegendItem}>
        <span className={styles.agendaLegendSwatch} style={{ background: "var(--surface)", boxShadow: "inset 0 0 0 2px var(--urgent)" }} />
        Urgência
      </span>
    </div>
  );
}
