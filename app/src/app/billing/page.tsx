import { redirect } from "next/navigation";
import { getCurrentClinic } from "@/lib/auth";
import { getPendingInvoice, PLAN_MONTHLY_PRICE } from "@/lib/asaas";
import { ClinicShell } from "@/components/clinic/ClinicShell";
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

  return (
    <ClinicShell clinicName={clinic.name} clinicLogoUrl={clinic.logo_url} title="Assinatura">
      <div className={styles.statGrid}>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{clinic.plan === "pro" ? "Pro" : "Starter"}</div>
          <div className={styles.statLabel}>Plano ({clinic.billing_cycle === "yearly" ? "anual" : "mensal"})</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>
            R$ {PLAN_MONTHLY_PRICE[clinic.plan]}
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
      </div>

      <div className={styles.panel}>
        <div className={styles.panelBody}>
          {clinic.subscription_status === "trialing" && clinic.trial_ends_at && (
            <p style={{ color: "var(--ink-soft)", fontSize: 14, margin: invoiceUrl ? "0 0 16px" : 0 }}>
              Teste gratuito até {new Date(clinic.trial_ends_at).toLocaleDateString("pt-BR")}.
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
    </ClinicShell>
  );
}
