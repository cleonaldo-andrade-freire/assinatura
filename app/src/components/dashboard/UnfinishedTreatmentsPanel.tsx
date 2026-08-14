import { ClickableRow } from "@/components/ui/ClickableRow";
import { formatBRDate } from "@/lib/date";
import styles from "@/styles/shell.module.css";

export interface UnfinishedTreatmentGroup {
  patientId: string;
  patientName: string;
  count: number;
  /** Data de criação do tratamento em aberto mais antigo desse paciente — quem espera há mais tempo aparece primeiro. */
  oldestCreatedAt: string;
}

/** Top 10 pacientes com tratamento em aberto, mais antigo primeiro — sem paginação, é um card de "o que olhar hoje", não uma listagem completa (a ficha do paciente tem a lista cheia). */
export function UnfinishedTreatmentsPanel({ groups }: { groups: UnfinishedTreatmentGroup[] }) {
  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <p className={styles.panelHeaderTitle}>Tratamentos em aberto</p>
      </div>
      {groups.length === 0 ? (
        <div className={styles.emptyState}>Nenhum tratamento em aberto no momento.</div>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Paciente</th>
              <th>Em aberto</th>
              <th>Desde</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <ClickableRow key={g.patientId} href={`/dashboard/pacientes/${g.patientId}?tab=tratamentos`}>
                <td className={styles.rowTitle}>{g.patientName}</td>
                <td data-label="Em aberto">
                  {g.count} tratamento{g.count === 1 ? "" : "s"}
                </td>
                <td data-label="Desde">{formatBRDate(g.oldestCreatedAt)}</td>
                <td style={{ textAlign: "right" }}>
                  <span className={`${styles.btn} ${styles.btnGhost}`}>Ver</span>
                </td>
              </ClickableRow>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
