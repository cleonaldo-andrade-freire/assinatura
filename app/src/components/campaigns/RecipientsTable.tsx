"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ToastStack, useToasts } from "@/components/ui/Toast";
import { ActionMenu } from "@/components/ui/ActionMenu";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CAMPAIGN_MANUAL_SKIP_REASON, RECIPIENT_STATUS_LABEL, recipientNeedsAttention } from "@/lib/campaigns";
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

type Filter = "all" | "attention" | CampaignRecipientStatus;
type Action = "yes" | "no" | "handled" | "wrong_number" | "retry";

const ACTION_LABEL: Record<Action, string> = {
  yes: "Marcar como SIM",
  no: "Marcar como NÃO",
  handled: "Já respondi pelo WhatsApp",
  wrong_number: "Número errado",
  retry: "Tentar enviar de novo",
};

/** Ações que pedem confirmação antes (as outras rodam direto). */
const ACTION_CONFIRM: Partial<Record<Action, { title: string; message: (name: string) => string; label: string; danger?: boolean }>> = {
  yes: {
    title: "Marcar como SIM",
    message: (name) => `O conteúdo da campanha (texto e mídia) será enviado agora para ${name} pelo WhatsApp, e um lead será aberto no quadro para acompanhar o agendamento.`,
    label: "Enviar conteúdo",
  },
  no: {
    title: "Marcar como NÃO",
    message: (name) => `${name} sai desta campanha e não entra mais nas próximas. Nenhuma mensagem é enviada.`,
    label: "Marcar como NÃO",
    danger: true,
  },
  wrong_number: {
    title: "Número errado",
    message: (name) =>
      `O telefone de ${name} não entra mais em campanhas, e o cadastro do paciente vai mostrar um aviso para confirmar e atualizar o número.`,
    label: "Marcar número errado",
    danger: true,
  },
};

const SUCCESS_MESSAGE: Record<Action, string> = {
  yes: "Conteúdo enviado e lead aberto no quadro.",
  no: "Contato marcado como NÃO.",
  handled: "Contato marcado como resolvido.",
  wrong_number: "Número marcado como errado.",
  retry: "Contato voltou para a fila de envio.",
};

/** Ações que fazem sentido para a situação do contato. */
function actionsFor(r: MarketingCampaignRecipient, editable: boolean): Action[] {
  switch (r.status) {
    case "sent":
      return ["yes", "no", "wrong_number"];
    case "replied":
      return r.handled_at ? ["yes", "no", "wrong_number"] : ["yes", "no", "handled", "wrong_number"];
    case "failed":
      return [...(editable ? (["retry"] as Action[]) : []), ...(r.handled_at ? [] : (["handled"] as Action[])), "wrong_number"];
    case "interested":
      return ["wrong_number"];
    default:
      return [];
  }
}

export function RecipientsTable({
  clinicId,
  campaignId,
  editable,
  recipients,
  truncated,
}: {
  clinicId: string;
  campaignId: string;
  /** Enviando/pausada: dá pra tirar quem ainda está na fila (ou devolver quem foi tirado) e reenviar erros. */
  editable: boolean;
  recipients: MarketingCampaignRecipient[];
  truncated: boolean;
}) {
  const router = useRouter();
  const { toasts, push, dismiss } = useToasts();
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, setPending] = useState<{ recipient: MarketingCampaignRecipient; action: Action } | null>(null);
  const attentionCount = recipients.filter(recipientNeedsAttention).length;
  const [filter, setFilter] = useState<Filter>(attentionCount > 0 ? "attention" : "all");

  async function call(r: MarketingCampaignRecipient, url: string, body: unknown): Promise<{ warning?: string | null } | null> {
    setBusy(r.id);
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        push(data?.message || "Não foi possível atualizar o contato.");
        return null;
      }
      router.refresh();
      return data ?? {};
    } finally {
      setBusy(null);
    }
  }

  function setRemoved(r: MarketingCampaignRecipient, removed: boolean) {
    return call(r, `/api/clinics/${clinicId}/campaigns/${campaignId}/recipients`, { phone: r.phone, removed });
  }

  async function runAction(r: MarketingCampaignRecipient, action: Action) {
    const result = await call(r, `/api/clinics/${clinicId}/campaigns/${campaignId}/recipients/${r.id}`, { action });
    setPending(null);
    if (result?.warning) push(result.warning);
    else if (result) push(SUCCESS_MESSAGE[action], "success");
  }

  function requestAction(r: MarketingCampaignRecipient, action: Action) {
    if (ACTION_CONFIRM[action]) setPending({ recipient: r, action });
    else void runAction(r, action);
  }

  const pendingConfirm = pending ? ACTION_CONFIRM[pending.action] : undefined;

  const counts = recipients.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {});
  const shown = filter === "all" ? recipients : filter === "attention" ? recipients.filter(recipientNeedsAttention) : recipients.filter((r) => r.status === filter);
  const filters: Filter[] = ["attention", "all", "interested", "replied", "sent", "declined", "pending", "failed", "skipped"];
  const filterLabel = (f: Filter) =>
    f === "all" ? `Todos (${recipients.length})` : f === "attention" ? `Precisa de atenção (${attentionCount})` : `${RECIPIENT_STATUS_LABEL[f]} (${counts[f] ?? 0})`;

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <span className={styles.panelHeaderTitle}>Contatos</span>
        <select className={styles.select} value={filter} onChange={(e) => setFilter(e.target.value as Filter)} style={{ maxWidth: 260 }}>
          {filters.map((f) => (
            <option key={f} value={f}>
              {filterLabel(f)}
            </option>
          ))}
        </select>
      </div>
      {shown.length === 0 ? (
        <div className={styles.emptyState}>{filter === "attention" ? "Nada pendente — todos os contatos estão resolvidos." : "Nenhum contato aqui."}</div>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Contato</th>
              <th>Situação</th>
              <th>Convite</th>
              <th>Resposta</th>
              <th aria-label="Ações" />
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const actions = actionsFor(r, editable);
              return (
                <tr key={r.id}>
                  <td data-label="Contato">
                    <div style={{ fontWeight: 600 }}>
                      {r.patient_id ? (
                        <a href={`/dashboard/pacientes/${r.patient_id}`} style={{ color: "inherit" }}>
                          {r.name || "Sem nome"}
                        </a>
                      ) : (
                        r.name || "Sem nome"
                      )}
                    </div>
                    <div style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>
                      {formatBRPhoneLocal(r.phone)} · {r.patient_id ? "paciente" : "lead"}
                    </div>
                  </td>
                  <td data-label="Situação">
                    <span className={`${styles.statusBadge} ${styles[STATUS_CLASS[r.status]]}`}>{RECIPIENT_STATUS_LABEL[r.status]}</span>
                    {r.skip_reason && <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 4 }}>{r.skip_reason}</div>}
                    {r.handled_at && (r.status === "replied" || r.status === "failed") && (
                      <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 4 }}>Resolvido em {formatBRDateTime(r.handled_at)}</div>
                    )}
                  </td>
                  <td data-label="Convite" style={{ fontSize: 13, whiteSpace: "nowrap" }}>
                    {r.sent_at ? formatBRDateTime(r.sent_at) : "—"}
                  </td>
                  <td data-label="Resposta" style={{ fontSize: 13 }}>
                    {r.reply_text ? <span title={r.replied_at ? formatBRDateTime(r.replied_at) : undefined}>&ldquo;{r.reply_text}&rdquo;</span> : "—"}
                  </td>
                  <td data-label="" style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    {editable && r.status === "pending" && (
                      <button type="button" className={`${styles.btn} ${styles.btnGhost}`} disabled={busy === r.id} onClick={() => setRemoved(r, true)}>
                        Tirar da fila
                      </button>
                    )}
                    {editable && r.status === "skipped" && r.skip_reason === CAMPAIGN_MANUAL_SKIP_REASON && (
                      <button type="button" className={`${styles.btn} ${styles.btnGhost}`} disabled={busy === r.id} onClick={() => setRemoved(r, false)}>
                        Devolver à fila
                      </button>
                    )}
                    <ActionMenu
                      label={`Ações para ${r.name || formatBRPhoneLocal(r.phone)}`}
                      disabled={busy === r.id}
                      items={actions.map((a) => ({ label: ACTION_LABEL[a], danger: !!ACTION_CONFIRM[a]?.danger, onClick: () => requestAction(r, a) }))}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <ConfirmDialog
        open={pending !== null}
        title={pendingConfirm?.title ?? ""}
        message={pending && pendingConfirm ? pendingConfirm.message(pending.recipient.name || formatBRPhoneLocal(pending.recipient.phone)) : ""}
        confirmLabel={pendingConfirm?.label}
        danger={pendingConfirm?.danger}
        loading={pending !== null && busy === pending.recipient.id}
        onConfirm={() => pending && runAction(pending.recipient, pending.action)}
        onCancel={() => setPending(null)}
      />
      <ToastStack toasts={toasts} onDismiss={dismiss} />
      {truncated && <p style={{ margin: 0, padding: "10px 24px", fontSize: 12.5, color: "var(--ink-faint)" }}>Mostrando os primeiros 1000 contatos.</p>}
    </div>
  );
}
