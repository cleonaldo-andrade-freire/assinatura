"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ToastStack, useToasts } from "@/components/ui/Toast";
import type { Plan, PlanRecord } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

export function PlanPicker({
  clinicId,
  currentPlan,
  pendingPlan,
  isTrialing,
  plans,
}: {
  clinicId: string;
  currentPlan: Plan;
  pendingPlan: Plan | null;
  isTrialing: boolean;
  plans: PlanRecord[];
}) {
  const router = useRouter();
  const [target, setTarget] = useState<Plan | null>(null);
  const [cancelPending, setCancelPending] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toasts, push, dismiss } = useToasts();

  const byId = new Map(plans.map((p) => [p.id, p]));
  const nameOf = (id: string) => byId.get(id)?.name ?? id;

  async function submitPlan(plan: Plan) {
    setLoading(true);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/plan`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (!res.ok) {
        push(data.message || "Falha ao trocar de plano. Tenta de novo.");
        return;
      }
      if (plan === currentPlan && !isTrialing) {
        push("Troca de plano cancelada.", "success");
      } else if (isTrialing) {
        push(`Plano ${nameOf(plan)} ativado — falta só confirmar o pagamento da primeira fatura.`, "success");
      } else {
        push(`Troca pra ${nameOf(plan)} agendada pra próxima cobrança.`, "success");
      }
      setTarget(null);
      setCancelPending(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  const targetPlan = target ? byId.get(target) : undefined;
  const currentPlanRecord = byId.get(currentPlan);
  const targetIsUpgrade = targetPlan && currentPlanRecord ? targetPlan.monthly_price > currentPlanRecord.monthly_price : false;

  return (
    <>
      {pendingPlan && (
        <div
          style={{
            background: "var(--warn-tint)",
            color: "var(--warn)",
            borderRadius: "var(--radius-sm)",
            padding: "10px 14px",
            fontSize: 13.5,
            marginBottom: 14,
          }}
        >
          Troca pra <strong>{nameOf(pendingPlan)}</strong> agendada — passa a valer na sua próxima cobrança.
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
          gap: 12,
        }}
      >
        {plans.map((p) => {
          const isCurrent = p.id === currentPlan;
          const isPending = p.id === pendingPlan;
          return (
            <div
              key={p.id}
              style={{
                border: isCurrent ? "2px solid var(--brand)" : isPending ? "2px solid var(--warn)" : "1px solid var(--line)",
                borderRadius: "var(--radius-sm)",
                padding: 14,
                background: isCurrent ? "var(--brand-tint)" : isPending ? "var(--warn-tint)" : "var(--surface)",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 14.5, color: "var(--ink)" }}>{p.name}</div>
              <div style={{ fontSize: 13, color: "var(--ink-soft)", margin: "2px 0 10px" }}>
                R$ {p.monthly_price.toFixed(2).replace(".", ",")}/mês · {p.monthly_limit} anamneses
              </div>
              {isPending ? (
                <button
                  type="button"
                  onClick={() => setCancelPending(true)}
                  className={`${styles.btn} ${styles.btnGhost}`}
                  style={{ padding: "6px 10px", fontSize: 12.5, width: "100%", justifyContent: "center" }}
                >
                  Cancelar troca
                </button>
              ) : isCurrent ? (
                <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--brand-deep)" }}>Plano atual</span>
              ) : (
                <button
                  type="button"
                  onClick={() => setTarget(p.id)}
                  className={`${styles.btn} ${styles.btnGhost}`}
                  style={{ padding: "6px 10px", fontSize: 12.5, width: "100%", justifyContent: "center" }}
                >
                  Mudar pra esse
                </button>
              )}
            </div>
          );
        })}
      </div>

      <ConfirmDialog
        open={!!target}
        title={target ? `Mudar para o plano ${nameOf(target)}` : ""}
        message={
          target && targetPlan
            ? isTrialing
              ? `Isso já gera a primeira fatura do plano ${targetPlan.name}, com vencimento hoje. Assim que o pagamento for confirmado, o limite de ${targetPlan.monthly_limit} anamneses/mês passa a valer.`
              : `${targetIsUpgrade ? "O valor novo" : "O valor menor"} só entra na sua próxima cobrança — nada muda nem é cobrado agora. O novo limite de anamneses (${targetPlan.monthly_limit}/mês) também só passa a valer nessa data.`
            : ""
        }
        confirmLabel={isTrialing ? "Confirmar plano" : "Agendar troca"}
        cancelLabel="Cancelar"
        loading={loading}
        onConfirm={() => target && submitPlan(target)}
        onCancel={() => setTarget(null)}
      />

      <ConfirmDialog
        open={cancelPending}
        title="Cancelar troca de plano agendada"
        message={`Sua assinatura continua em ${nameOf(currentPlan)}, sem mudar na próxima cobrança.`}
        confirmLabel="Cancelar troca"
        cancelLabel="Voltar"
        danger
        loading={loading}
        onConfirm={() => submitPlan(currentPlan)}
        onCancel={() => setCancelPending(false)}
      />
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </>
  );
}
