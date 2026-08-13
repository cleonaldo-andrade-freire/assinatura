import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentClinic } from "@/lib/auth";
import { ClinicShell } from "@/components/clinic/ClinicShell";
import { ClinicProfileForm } from "@/components/ClinicProfileForm";
import { LogoUpload } from "@/components/LogoUpload";
import { ConnectWhatsApp } from "@/components/ConnectWhatsApp";
import { PlanPicker } from "@/components/PlanPicker";
import { getPendingInvoice, listPayments, PAYMENT_STATUS_LABEL, type AsaasPayment } from "@/lib/asaas";
import { effectiveMonthlyPrice, getActivePlans, getPlanById } from "@/lib/plans";
import { TRIAL_ANAMNESIS_LIMIT } from "@/lib/billing";
import { countMonthlyAnamneses, countTotalAnamneses } from "@/lib/usage";
import { formatBRDate } from "@/lib/date";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { UsageCharge } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

const SUBSCRIPTION_STATUS_LABEL: Record<string, string> = {
  trialing: "Em período de teste",
  active: "Em dia",
  past_due: "Pagamento em atraso",
  canceled: "Cancelada",
};

const SUBSCRIPTION_STATUS_CLASS: Record<string, string> = {
  trialing: styles.statusOk,
  active: styles.statusOk,
  past_due: styles.statusWarn,
  canceled: styles.statusDanger,
};

export default async function SettingsPage() {
  const clinic = await getCurrentClinic();
  if (!clinic) redirect("/login");

  let invoiceUrl: string | null = null;
  let payments: AsaasPayment[] = [];
  if (clinic.asaas_subscription_id) {
    try {
      payments = await listPayments(clinic.asaas_subscription_id);
    } catch (err) {
      console.error("Falha ao buscar cobranças no Asaas:", err);
    }
    if (clinic.subscription_status !== "trialing") {
      try {
        const invoice = await getPendingInvoice(clinic.asaas_subscription_id);
        invoiceUrl = invoice?.invoiceUrl ?? null;
      } catch (err) {
        console.error("Falha ao buscar fatura pendente no Asaas:", err);
      }
    }
  }

  const supabase = await createSupabaseServerClient();
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const isTrialing = clinic.subscription_status === "trialing";

  const [usedThisMonth, usedInTrial, { data: monthlyCharges }, activePlans, currentPlan] = await Promise.all([
    countMonthlyAnamneses(supabase, clinic.id),
    isTrialing ? countTotalAnamneses(supabase, clinic.id) : Promise.resolve(0),
    supabase
      .from("usage_charges")
      .select("*")
      .eq("clinic_id", clinic.id)
      .gte("created_at", startOfMonth.toISOString())
      .order("created_at", { ascending: false }),
    getActivePlans(supabase),
    getPlanById(supabase, clinic.plan),
  ]);

  // Clínica pode estar num plano já desativado — garante que ele apareça no
  // seletor mesmo assim (senão sumiria da tela sem explicação nenhuma).
  const plans = currentPlan && !activePlans.some((p) => p.id === currentPlan.id) ? [...activePlans, currentPlan] : activePlans;

  const limit = isTrialing ? TRIAL_ANAMNESIS_LIMIT : currentPlan?.monthly_limit ?? 0;
  const used = isTrialing ? usedInTrial : usedThisMonth;
  const overageCount = isTrialing ? 0 : Math.max(0, used - limit);
  const charges = (monthlyCharges as UsageCharge[]) ?? [];
  const chargedTotal = charges.reduce((sum, c) => sum + Number(c.amount), 0);
  const monthlyPrice = currentPlan ? effectiveMonthlyPrice(clinic, currentPlan) : 0;

  return (
    <ClinicShell
      clinicName={clinic.name}
      clinicLogoUrl={clinic.logo_url}
      title="Configurações"
      subtitle="Dados do responsável técnico, WhatsApp, identidade visual e assinatura da clínica"
    >
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <p className={styles.panelHeaderTitle}>Logo da clínica</p>
        </div>
        <div className={styles.panelBody}>
          <LogoUpload
            clinicId={clinic.id}
            currentLogoUrl={clinic.logo_url}
            uploadUrl={`/api/clinics/${clinic.id}/logo`}
          />
        </div>
      </div>

      <ClinicProfileForm clinicId={clinic.id} clinic={clinic} />

      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <p className={styles.panelHeaderTitle}>WhatsApp</p>
        </div>
        <div className={styles.panelBody}>
          <p className={styles.hint} style={{ marginBottom: 14 }}>
            Esse é o número usado em toda a comunicação com o paciente: é nele que a anamnese é respondida e é dele
            que saem as notificações da clínica (link de assinatura, atestado emitido, lembretes).
          </p>
          <ConnectWhatsApp clinicId={clinic.id} initialWhatsappNumber={clinic.whatsapp_number} />
        </div>
      </div>

      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <p className={styles.panelHeaderTitle}>Modelos de mensagem da agenda</p>
        </div>
        <div className={styles.panelBody}>
          <p className={styles.hint} style={{ marginBottom: 14 }}>
            Personalize o texto que o paciente recebe ao agendar, nos lembretes e nas respostas de
            confirmação/cancelamento — se não personalizar, a clínica usa um texto padrão.
          </p>
          <Link href="/dashboard/configuracoes/mensagens" className={`${styles.btn} ${styles.btnGhost}`}>
            Editar modelos de mensagem
          </Link>
        </div>
      </div>

      <div id="assinatura" style={{ scrollMarginTop: 20 }}>
        <h2 className={styles.pageTitle} style={{ fontSize: 20, margin: "8px 0 16px" }}>
          Assinatura
        </h2>

        <div className={styles.statGrid}>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{currentPlan?.name ?? clinic.plan}</div>
            <div className={styles.statLabel}>Plano ({clinic.billing_cycle === "yearly" ? "anual" : "mensal"})</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>
              R$ {monthlyPrice.toFixed(2).replace(".", ",")}
              {clinic.billing_cycle === "yearly" ? "×10" : ""}
            </div>
            <div className={styles.statLabel}>{clinic.billing_cycle === "yearly" ? "Por ano" : "Por mês"}</div>
            {clinic.custom_monthly_price != null && (
              <div style={{ marginTop: 4, fontSize: 11.5, color: "var(--brand)", fontWeight: 600 }}>Preço especial</div>
            )}
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>
              <span className={`${styles.statusDot} ${SUBSCRIPTION_STATUS_CLASS[clinic.subscription_status] ?? ""}`}>
                {SUBSCRIPTION_STATUS_LABEL[clinic.subscription_status] ?? clinic.subscription_status}
              </span>
            </div>
            <div className={styles.statLabel}>Status da assinatura</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>
              {used}/{limit}
            </div>
            <div className={styles.statLabel}>{isTrialing ? "Anamneses do período de teste" : "Anamneses usadas este mês"}</div>
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
                ({limit}/mês) — R$ {(currentPlan?.overage_price ?? 0).toFixed(2).replace(".", ",")} por anamnese
                extra, somado direto na sua próxima fatura (não gera cobrança separada).
              </p>
              {charges.length > 0 && (
                <p style={{ color: "var(--ink)", fontSize: 14, fontWeight: 600, margin: "8px 0 0" }}>
                  Excedente já incluído na fatura: R$ {chargedTotal.toFixed(2).replace(".", ",")}
                </p>
              )}
            </div>
          </div>
        )}

        {payments.length > 0 && (
          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <p className={styles.panelHeaderTitle}>Cobranças</p>
            </div>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Vencimento</th>
                  <th>Valor</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td className={styles.rowTitle}>{formatBRDate(p.dueDate)}</td>
                    <td data-label="Valor">R$ {p.value.toFixed(2).replace(".", ",")}</td>
                    <td data-label="Status">{PAYMENT_STATUS_LABEL[p.status] ?? p.status}</td>
                    <td>
                      <a href={p.invoiceUrl} target="_blank" rel="noreferrer">
                        Ver fatura
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <p className={styles.panelHeaderTitle}>Trocar de plano</p>
          </div>
          <div className={styles.panelBody}>
            <PlanPicker
              clinicId={clinic.id}
              currentPlan={clinic.plan}
              pendingPlan={clinic.pending_plan}
              isTrialing={isTrialing}
              plans={plans}
            />
          </div>
        </div>
      </div>
    </ClinicShell>
  );
}
