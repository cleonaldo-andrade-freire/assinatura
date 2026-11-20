"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ToastStack, useToasts } from "@/components/ui/Toast";
import { CAMPAIGN_DAILY_LIMIT } from "@/lib/campaigns";
import type { CampaignStatus } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

type Action = "start" | "pause" | "resume" | "cancel" | "delete" | "test";

const CONFIRM: Record<Action, { title: string; message: string; label: string; danger?: boolean }> = {
  test: {
    title: "Enviar teste",
    message: "O convite e o conteúdo vão agora para o celular de aviso da clínica (Configurações), para você ver como chegam. Nenhum paciente recebe.",
    label: "Enviar teste para mim",
  },
  start: {
    title: "Iniciar envio",
    message: `Os convites começam a sair um a cada 4 a 7 minutos, de segunda a sexta das 9h às 18h, no máximo ${CAMPAIGN_DAILY_LIMIT} por dia. Dá para pausar a qualquer momento.`,
    label: "Iniciar envio",
  },
  pause: { title: "Pausar campanha", message: "Nenhum convite novo sai até você retomar. Quem já recebeu ainda pode responder.", label: "Pausar" },
  resume: { title: "Retomar campanha", message: "Os convites voltam a sair no próximo horário liberado.", label: "Retomar" },
  cancel: {
    title: "Cancelar campanha",
    message: "Quem ainda não recebeu o convite sai da fila. Não dá para desfazer — quem já recebeu ainda pode responder SIM.",
    label: "Cancelar campanha",
    danger: true,
  },
  delete: { title: "Excluir rascunho", message: "O rascunho e a mídia dele são apagados.", label: "Excluir", danger: true },
};

export function CampaignActions({ clinicId, campaignId, status }: { clinicId: string; campaignId: string; status: CampaignStatus }) {
  const router = useRouter();
  const { toasts, push, dismiss } = useToasts();
  const [pending, setPending] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: Action) {
    setBusy(true);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/campaigns/${campaignId}`, {
        method: action === "delete" ? "DELETE" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: action === "delete" ? undefined : JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        push(data?.message || "Não foi possível concluir a ação.");
        return;
      }
      if (action === "delete") {
        router.push("/dashboard/campanhas");
        router.refresh();
        return;
      }
      push(
        action === "start" ? `Campanha iniciada — ${data.count} contatos na fila.` : action === "test" ? "Teste enviado — confira no seu WhatsApp." : "Campanha atualizada.",
        "success"
      );
      router.refresh();
    } finally {
      setBusy(false);
      setPending(null);
    }
  }

  const buttons: { action: Action; primary?: boolean }[] =
    status === "rascunho"
      ? [{ action: "delete" }, { action: "test" }, { action: "start", primary: true }]
      : status === "enviando"
        ? [{ action: "cancel" }, { action: "pause", primary: true }]
        : status === "pausada"
          ? [{ action: "cancel" }, { action: "resume", primary: true }]
          : [];

  return (
    <>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {buttons.map((b) => (
          <button
            key={b.action}
            type="button"
            disabled={busy}
            onClick={() => setPending(b.action)}
            className={`${styles.btn} ${b.primary ? styles.btnPrimary : CONFIRM[b.action].danger ? styles.btnDanger : styles.btnGhost}`}
          >
            {CONFIRM[b.action].label}
          </button>
        ))}
      </div>
      <ConfirmDialog
        open={pending !== null}
        title={pending ? CONFIRM[pending].title : ""}
        message={pending ? CONFIRM[pending].message : ""}
        confirmLabel={pending ? CONFIRM[pending].label : undefined}
        danger={pending ? CONFIRM[pending].danger : undefined}
        loading={busy}
        onConfirm={() => pending && run(pending)}
        onCancel={() => setPending(null)}
      />
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </>
  );
}
