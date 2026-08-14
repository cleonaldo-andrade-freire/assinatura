import { ClickableRow } from "@/components/ui/ClickableRow";
import { formatMoneyDisplay } from "@/lib/money";
import styles from "@/styles/shell.module.css";

export interface OpenDebitGroup {
  patientId: string;
  patientName: string;
  count: number;
  total: number;
}

function formatMoney(value: number): string {
  return `R$ ${formatMoneyDisplay(value)}`;
}

/** Top 10 pacientes com débito em aberto, maior valor devido primeiro — sem paginação (ver UnfinishedTreatmentsPanel). */
export function OpenDebitsPanel({ groups }: { groups: OpenDebitGroup[] }) {
  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <p className={styles.panelHeaderTitle}>Pacientes com débito em aberto</p>
      </div>
      {groups.length === 0 ? (
        <div className={styles.emptyState}>Nenhum débito em aberto no momento.</div>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Paciente</th>
              <th>Débitos</th>
              <th>Total devido</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <ClickableRow key={g.patientId} href={`/dashboard/pacientes/${g.patientId}?tab=debitos`}>
                <td className={styles.rowTitle}>{g.patientName}</td>
                <td data-label="Débitos">
                  {g.count} débito{g.count === 1 ? "" : "s"}
                </td>
                <td data-label="Total devido" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {formatMoney(g.total)}
                </td>
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
