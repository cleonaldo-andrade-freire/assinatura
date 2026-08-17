import { redirect } from "next/navigation";
import { hasAdminSession } from "@/lib/adminSession";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { asaasCustomerDashboardUrl, listPayments, PAYMENT_STATUS_LABEL, type AsaasPayment } from "@/lib/asaas";
import { getPlanById } from "@/lib/plans";
import { TRIAL_ANAMNESIS_LIMIT } from "@/lib/billing";
import { countMonthlyAnamneses } from "@/lib/usage";
import { AdminShell } from "@/components/admin/AdminShell";
import { CancelClinicButton } from "@/components/CancelClinicButton";
import { ClinicBillingAdjustments } from "@/components/ClinicBillingAdjustments";
import { LogoUpload } from "@/components/LogoUpload";
import { WhatsappConfigForm } from "@/components/WhatsappConfigForm";
import { formatBRDate } from "@/lib/date";
import type { Clinic } from "@/lib/database.types";
import styles from "@/components/admin/admin.module.css";

const STATUS_META: Record<string, { label: string; className: string }> = {
  trialing: { label: "Em período de teste", className: styles.statusOk },
  active: { label: "Em dia", className: styles.statusOk },
  past_due: { label: "Pagamento em atraso", className: styles.statusWarn },
  canceled: { label: "Cancelada", className: styles.statusDanger },
};

export default async function AdminClinicDetailPage({ params }: { params: { id: string } }) {
  if (!(await hasAdminSession())) redirect("/admin/login");

  const supabase = createSupabaseAdminClient();
  const { data: clinic } = await supabase.from("clinics").select("*").eq("id", params.id).single();
  if (!clinic) redirect("/admin/clinics");
  const typedClinic = clinic as Clinic;
  const status = STATUS_META[typedClinic.subscription_status] ?? {
    label: typedClinic.subscription_status,
    className: "",
  };

  const [
    { count: anamnesesCount },
    { count: signaturesCount },
    { data: recentAnamneses },
    { data: signatures },
    usedThisMonth,
    plan,
    pendingPlan,
  ] = await Promise.all([
    supabase.from("anamneses").select("id", { count: "exact", head: true }).eq("clinic_id", typedClinic.id),
    supabase.from("signatures").select("id", { count: "exact", head: true }).eq("clinic_id", typedClinic.id),
    supabase
      .from("anamneses")
      .select("id, patient_name, created_at")
      .eq("clinic_id", typedClinic.id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("signatures").select("anamnesis_id").eq("clinic_id", typedClinic.id),
    countMonthlyAnamneses(supabase, typedClinic.id),
    getPlanById(supabase, typedClinic.plan),
    typedClinic.pending_plan ? getPlanById(supabase, typedClinic.pending_plan) : Promise.resolve(null),
  ]);

  const signedAnamnesisIds = new Set((signatures ?? []).map((s) => s.anamnesis_id));
  const isTrialing = typedClinic.subscription_status === "trialing";
  const overTrial = isTrialing && usedThisMonth > TRIAL_ANAMNESIS_LIMIT;

  let payments: AsaasPayment[] = [];
  if (typedClinic.asaas_subscription_id) {
    try {
      payments = await listPayments(typedClinic.asaas_subscription_id);
    } catch (err) {
      console.error("Falha ao buscar pagamentos no Asaas:", err);
    }
  }

  return (
    <AdminShell
      title={typedClinic.name}
      subtitle={`/${typedClinic.slug}`}
      actions={
        typedClinic.subscription_status !== "canceled" ? (
          <CancelClinicButton clinicId={typedClinic.id} />
        ) : undefined
      }
    >
      <div className={styles.statGrid}>
        <div className={styles.statCard}>
          <div className={styles.statValue}>
            <span className={`${styles.statusDot} ${status.className}`}>{status.label}</span>
          </div>
          <div className={styles.statLabel}>Status da assinatura</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{anamnesesCount ?? 0}</div>
          <div className={styles.statLabel}>Anamneses recebidas</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{signaturesCount ?? 0}</div>
          <div className={styles.statLabel}>Assinadas</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue} style={{ color: overTrial ? "var(--danger)" : undefined }}>
            {isTrialing ? `${usedThisMonth}/${TRIAL_ANAMNESIS_LIMIT}` : usedThisMonth}
          </div>
          <div className={styles.statLabel}>{isTrialing ? "Anamneses do trial" : "Anamneses este mês"}</div>
          {overTrial && (
            <div style={{ marginTop: 4, fontSize: 11.5, color: "var(--danger)", fontWeight: 600 }}>
              passou do limite
            </div>
          )}
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{plan?.name ?? typedClinic.plan}</div>
          <div className={styles.statLabel}>
            Plano ({typedClinic.billing_cycle === "yearly" ? "anual" : "mensal"})
          </div>
          {pendingPlan && (
            <div style={{ marginTop: 6, fontSize: 12, color: "var(--warn)", fontWeight: 600 }}>
              → {pendingPlan.name} na próxima cobrança
            </div>
          )}
        </div>
      </div>

      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <p className={styles.panelHeaderTitle}>Identidade visual</p>
        </div>
        <div className={styles.panelBody}>
          <LogoUpload clinicId={typedClinic.id} currentLogoUrl={typedClinic.logo_url} />
        </div>
      </div>

      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <p className={styles.panelHeaderTitle}>WhatsApp / Evolution API</p>
        </div>
        <div className={styles.panelBody}>
          <WhatsappConfigForm clinicId={typedClinic.id} clinic={typedClinic} />
        </div>
      </div>

      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <p className={styles.panelHeaderTitle}>Informações</p>
        </div>
        <div className={styles.panelBody}>
          <div className={styles.defGrid}>
            <div className={styles.defItem}>
              <span className={styles.defLabel}>Trial até</span>
              <span className={styles.defValue}>
                {typedClinic.trial_ends_at ? formatBRDate(typedClinic.trial_ends_at) : "—"}
              </span>
            </div>
            <div className={styles.defItem}>
              <span className={styles.defLabel}>Criada em</span>
              <span className={styles.defValue}>{formatBRDate(typedClinic.created_at)}</span>
            </div>
            {typedClinic.asaas_customer_id && (
              <div className={styles.defItem}>
                <span className={styles.defLabel}>Asaas</span>
                <span className={styles.defValue}>
                  <a href={asaasCustomerDashboardUrl(typedClinic.asaas_customer_id)} target="_blank" rel="noreferrer">
                    Ver cliente no Asaas ↗
                  </a>
                </span>
              </div>
            )}
            <div className={styles.defItem} style={{ gridColumn: "1 / -1" }}>
              <span className={styles.defLabel}>API key (Typebot)</span>
              <span className={styles.defValueMono}>{typedClinic.api_key}</span>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <p className={styles.panelHeaderTitle}>Ajustes de cobrança</p>
        </div>
        <div className={styles.panelBody}>
          <ClinicBillingAdjustments clinicId={typedClinic.id} clinic={typedClinic} defaultMonthlyPrice={plan?.monthly_price ?? 0} />
        </div>
      </div>

      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <p className={styles.panelHeaderTitle}>Histórico de anamneses</p>
        </div>
        {!recentAnamneses || recentAnamneses.length === 0 ? (
          <div className={styles.emptyState}>Nenhuma anamnese registrada ainda.</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Paciente</th>
                <th>Data</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {recentAnamneses.map((a) => (
                <tr key={a.id}>
                  <td>{a.patient_name}</td>
                  <td>{formatBRDate(a.created_at)}</td>
                  <td>
                    {signedAnamnesisIds.has(a.id) ? (
                      <span className={`${styles.statusDot} ${styles.statusOk}`}>Assinado</span>
                    ) : (
                      <span className={`${styles.statusDot} ${styles.statusWarn}`}>Pendente</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <p className={styles.panelHeaderTitle}>Cobranças recentes</p>
        </div>
        {payments.length === 0 ? (
          <div className={styles.emptyState}>Nenhuma cobrança encontrada (ou Asaas não configurado).</div>
        ) : (
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
                  <td>{formatBRDate(`${p.dueDate}T12:00:00-03:00`)}</td>
                  <td>R$ {p.value.toFixed(2)}</td>
                  <td>{PAYMENT_STATUS_LABEL[p.status] ?? p.status}</td>
                  <td>
                    <a href={p.invoiceUrl} target="_blank" rel="noreferrer">
                      Ver fatura
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AdminShell>
  );
}
