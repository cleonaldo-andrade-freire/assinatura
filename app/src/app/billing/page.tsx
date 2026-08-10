import { redirect } from "next/navigation";
import { getCurrentClinic } from "@/lib/auth";
import { getPendingInvoice, PLAN_LABEL, PLAN_MONTHLY_LIMIT, PLAN_MONTHLY_PRICE, OVERAGE_PRICE } from "@/lib/asaas";
import { countMonthlyAnamneses } from "@/lib/usage";
import { formatBRDate } from "@/lib/date";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ClinicShell } from "@/components/clinic/ClinicShell";
import { PlanPicker } from "@/components/PlanPicker";
import type { UsageCharge } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

const STATUS_LABEL: Record<string, string> = {
  trialing: "Em período de teste",
  active: "Em dia",
  past_due: "Pagamento em atraso",
  canceled: "Cancelada",
};

const STATUS_CLASS: Record<string, string> = {
  trialing: styles.statusOk,
  active: styles.statusOk,
  past_due: styles.statusWarn,
  canceled: styles.statusDanger,
};

export default async function BillingPage() {
  const clinic = await getCurrentClinic();
  if (!clinic) redirect("/login");

  let invoiceUrl: string | null = null;
  if (clinic.asaas_subscription_id && clinic.subscription_status !== "trialing") {
    try {
      const invoice = await getPendingInvoice(clinic.asaas_subscription_id);
      invoiceUrl = invoice?.invoiceUrl ?? null;
    } catch (err) {
      console.error("Falha ao buscar fatura pendente no Asaas:", err);
    }
  }

  const supabase = await createSupabaseServerClient();
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [usedThisMonth, { data: monthlyCharges }] = await Promise.all([
    countMonthlyAnamneses(supabase, clinic.id),
    supabase
      .from("usage_charges")
      .select("*")
      .eq("clinic_id", clinic.id)
      .gte("created_at", startOfMonth.toISOString())
      .order("created_at", { ascending: false }),
  ]);

  const limit = PLAN_MONTHLY_LIMIT[clinic.plan];
  const overageCount = Math.max(0, usedThisMonth - limit);
  const charges = (monthlyCharges as UsageCharge[]) ?? [];
  const chargedTotal = charges.reduce((sum, c) => sum + Number(c.amount), 0);

  return (
    <ClinicShell clinicName={clinic.name} clinicLogoUrl={clinic.logo_url} title="Assinatura">
      <div className={styles.statGrid}>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{PLAN_LABEL[clinic.plan]}</div>
          <div className={styles.statLabel}>Plano ({clinic.billing_cycle === "yearly" ? "anual" : "mensal"})</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>
            R$ {PLAN_MONTHLY_PRICE[clinic.plan].toFixed(2).replace(".", ",")}
            {clinic.billing_cycle === "yearly" ? "×10" : ""}
          </div>
          <div className={styles.statLabel}>{clinic.billing_cycle === "yearly" ? "Por ano" : "Por mês"}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>
            <span className={`${styles.statusDot} ${STATUS_CLASS[clinic.subscription_status] ?? ""}`}>
              {STATUS_LABEL[clinic.subscription_status] ?? clinic.subscription_status}
            </span>
          </div>
          <div className={styles.statLabel}>Status da assinatura</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>
            {usedThisMonth}/{limit}
          </div>
          <div className={styles.statLabel}>Anamneses usadas este mês</div>
        </div>
      </div>

      <div className={styles.panel}>
        <div className={styles.panelBody}>
          {clinic.subscription_status === "trialing" && clinic.trial_ends_at && (
            <p style={{ color: "var(--ink-soft)", fontSize: 14, margin: invoiceUrl ? "0 0 16px" : 0 }}>
              Teste gratuito até {formatBRDate(clinic.trial_ends_at)}.
            </p>
          )}
          {invoiceUrl ? (
            <a href={invoiceUrl} target="_blank" rel="noreferrer" className={`${styles.btn} ${styles.btnPrimary}`}>
              Pagar fatura pendente
            </a>
          ) : (
            clinic.subscription_status !== "trialing" && (
              <p style={{ color: "var(--ink-soft)", fontSize: 14, margin: 0 }}>Nenhuma fatura pendente no momento.</p>
            )
          )}
        </div>
      </div>

      {overageCount > 0 && (
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <p className={styles.panelHeaderTitle}>Excedente do mês</p>
          </div>
          <div className={styles.panelBody}>
            <p style={{ color: "var(--ink-soft)", fontSize: 14, margin: "0 0 4px" }}>
              Você já passou {overageCount} anamnese{overageCount === 1 ? "" : "s"} do limite do plano
              ({limit}/mês) — cada uma extra é cobrada à parte, R$ {OVERAGE_PRICE.toFixed(2).replace(".", ",")}.
            </p>
            {charges.length > 0 && (
              <p style={{ color: "var(--ink)", fontSize: 14, fontWeight: 600, margin: "8px 0 0" }}>
                Total cobrado em excedentes este mês: R$ {chargedTotal.toFixed(2).replace(".", ",")} (
                {charges.length} cobrança{charges.length === 1 ? "" : "s"})
              </p>
            )}
          </div>
        </div>
      )}

      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <p className={styles.panelHeaderTitle}>Trocar de plano</p>
        </div>
        <div className={styles.panelBody}>
          <PlanPicker clinicId={clinic.id} currentPlan={clinic.plan} pendingPlan={clinic.pending_plan} />
        </div>
      </div>
    </ClinicShell>
  );
}
