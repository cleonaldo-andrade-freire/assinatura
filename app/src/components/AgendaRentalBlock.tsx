import Link from "next/link";
import { formatBRTime } from "@/lib/date";
import type { AgendaRental } from "@/lib/roomRental";
import styles from "@/styles/shell.module.css";

/**
 * Turno da sala alugado (migration 073), desenhado na agenda como bloqueio —
 * nunca "vago", porque o servidor recusa consulta ali. `continuation` é a
 * faixa discreta dos slots seguintes na lista diária do celular (na grade
 * semanal o bloco ocupa todos os slots via `grid-row: span`).
 */
export function AgendaRentalBlock({
  rental,
  href,
  continuation = false,
  compact = false,
}: {
  rental: AgendaRental;
  /** Só o owner tem a tela de Locação — sem href, o bloco não é link. */
  href?: string;
  continuation?: boolean;
  /** Grade semanal: colunas estreitas, nome e horário em linhas curtas. */
  compact?: boolean;
}) {
  const time = `${formatBRTime(rental.starts_at)}–${formatBRTime(rental.ends_at)}`;
  const content = continuation ? (
    <>↳ Sala alugada ({rental.tenantName})</>
  ) : (
    <span style={{ minWidth: 0 }}>
      <strong className={styles.agendaRentalTitle}>🔑 Sala alugada{compact ? "" : ` — ${rental.tenantName}`}</strong>
      {compact && <span className={styles.agendaRentalLine}>{rental.tenantName}</span>}
      <span className={styles.agendaRentalLine}>
        {rental.shiftName} · {time}
      </span>
    </span>
  );
  const className = `${styles.agendaRentalBlock} ${continuation ? styles.agendaRentalContinuation : ""} ${compact ? styles.agendaRentalCompact : ""}`;
  const title = `Sala alugada para ${rental.tenantName} — ${rental.shiftName}, ${time}`;
  return href ? (
    <Link href={href} className={className} title={title}>
      {content}
    </Link>
  ) : (
    <div className={className} title={title}>
      {content}
    </div>
  );
}
