"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ToastStack, useToasts } from "@/components/ui/Toast";
import { CAMPAIGN_MANUAL_SKIP_REASON, RECIPIENT_STATUS_LABEL } from "@/lib/campaigns";
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

export function RecipientsTable({
  clinicId,
  campaignId,
  editable,
  recipients,
  truncated,
}: {
  clinicId: string;
  campaignId: string;
  /** Enviando/pausada: dá pra tirar quem ainda está na fila (ou devolver quem foi tirado). */
  editable: boolean;
  recipients: MarketingCampaignRecipient[];
  truncated: boolean;
}) {
  const router = useRouter();
  const { toasts, push, dismiss } = useToasts();
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  async function setRemoved(r: MarketingCampaignRecipient, removed: boolean) {
    setBusy(r.id);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/campaigns/${campaignId}/recipients`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: r.phone, removed }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        push(data?.message || "Não foi possível atualizar o contato.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }
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
              {editable && <th aria-label="Ações" />}
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
                {editable && (
                  <td data-label="" style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    {r.status === "pending" && (
                      <button type="button" className={`${styles.btn} ${styles.btnGhost}`} disabled={busy === r.id} onClick={() => setRemoved(r, true)}>
                        Tirar da fila
                      </button>
                    )}
                    {r.status === "skipped" && r.skip_reason === CAMPAIGN_MANUAL_SKIP_REASON && (
                      <button type="button" className={`${styles.btn} ${styles.btnGhost}`} disabled={busy === r.id} onClick={() => setRemoved(r, false)}>
                        Devolver à fila
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
      {truncated && <p style={{ margin: 0, padding: "10px 24px", fontSize: 12.5, color: "var(--ink-faint)" }}>Mostrando os primeiros 1000 contatos.</p>}
    </div>
  );
}
