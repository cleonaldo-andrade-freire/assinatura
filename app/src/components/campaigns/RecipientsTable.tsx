"use client";

import { useState } from "react";
import { RECIPIENT_STATUS_LABEL } from "@/lib/campaigns";
import { formatBRDateTime } from "@/lib/date";
import { formatBRPhoneLocal } from "@/lib/validation";
import type { CampaignRecipientStatus, MarketingCampaignRecipient } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

const STATUS_CLASS: Record<CampaignRecipientStatus, string> = {
  pending: "statusMuted",
  sending: "statusMuted",
  sent: "statusInfo",
  interested: "statusOk",
  declined: "statusDanger",
  replied: "statusWarn",
  failed: "statusDanger",
  skipped: "statusNeutral",
};

type Filter = "all" | CampaignRecipientStatus;

export function RecipientsTable({ recipients, truncated }: { recipients: MarketingCampaignRecipient[]; truncated: boolean }) {
  const [filter, setFilter] = useState<Filter>("all");
  const counts = recipients.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {});
  const shown = filter === "all" ? recipients : recipients.filter((r) => r.status === filter);
  const filters: Filter[] = ["all", "interested", "replied", "sent", "declined", "pending", "failed", "skipped"];

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <span className={styles.panelHeaderTitle}>Contatos</span>
        <select className={styles.select} value={filter} onChange={(e) => setFilter(e.target.value as Filter)} style={{ maxWidth: 260 }}>
          {filters.map((f) => (
            <option key={f} value={f}>
              {f === "all" ? `Todos (${recipients.length})` : `${RECIPIENT_STATUS_LABEL[f]} (${counts[f] ?? 0})`}
            </option>
          ))}
        </select>
      </div>
      {shown.length === 0 ? (
        <div className={styles.emptyState}>Nenhum contato aqui.</div>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Contato</th>
              <th>Situação</th>
              <th>Convite</th>
              <th>Resposta</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                <td data-label="Contato">
                  <div style={{ fontWeight: 600 }}>{r.name || "Sem nome"}</div>
                  <div style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>
                    {formatBRPhoneLocal(r.phone)} · {r.patient_id ? "paciente" : "lead"}
                  </div>
                </td>
                <td data-label="Situação">
                  <span className={`${styles.statusBadge} ${styles[STATUS_CLASS[r.status]]}`}>{RECIPIENT_STATUS_LABEL[r.status]}</span>
                  {r.skip_reason && <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 4 }}>{r.skip_reason}</div>}
                </td>
                <td data-label="Convite" style={{ fontSize: 13, whiteSpace: "nowrap" }}>
                  {r.sent_at ? formatBRDateTime(r.sent_at) : "—"}
                </td>
                <td data-label="Resposta" style={{ fontSize: 13 }}>
                  {r.reply_text ? <span title={r.replied_at ? formatBRDateTime(r.replied_at) : undefined}>&ldquo;{r.reply_text}&rdquo;</span> : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {truncated && <p style={{ margin: 0, padding: "10px 24px", fontSize: 12.5, color: "var(--ink-faint)" }}>Mostrando os primeiros 1000 contatos.</p>}
    </div>
  );
}
