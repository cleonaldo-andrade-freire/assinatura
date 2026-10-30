import { ClickableRow } from "@/components/ui/ClickableRow";
import { formatMoneyDisplay } from "@/lib/money";
import type { TenantReceivable } from "@/lib/roomRental";
import styles from "@/styles/shell.module.css";

function formatMoney(value: number): string {
  return `R$ ${formatMoneyDisplay(value)}`;
}

function brDisplay(dateStr: string): string {
  return dateStr.split("-").reverse().join("/");
}

/** Locações da sala já usadas e não pagas (migration 073), por locatário — a
 * baixa é feita na tela de Locação, então cada linha leva pra lá. */
export function OpenRentalsPanel({ groups }: { groups: TenantReceivable[] }) {
  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <p className={styles.panelHeaderTitle}>Locações da sala a receber</p>
      </div>
      {groups.length === 0 ? (
        <div className={styles.emptyState}>Nenhuma locação a receber no momento.</div>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Locatário</th>
              <th>Locações</th>
              <th>Total a receber</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <ClickableRow key={g.tenant.id} href="/dashboard/locacao">
                <td className={styles.rowTitle}>{g.tenant.name}</td>
                <td data-label="Locações">
                  {g.rentals.length} turno{g.rentals.length === 1 ? "" : "s"} · desde {brDisplay(g.rentals[0].rental_date)}
                </td>
                <td data-label="Total a receber" style={{ fontVariantNumeric: "tabular-nums" }}>
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
