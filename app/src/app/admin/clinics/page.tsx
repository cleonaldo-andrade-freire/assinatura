import { redirect } from "next/navigation";
import Link from "next/link";
import { hasAdminSession } from "@/lib/adminSession";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { AdminShell } from "@/components/admin/AdminShell";
import { PLAN_LABEL, PLAN_MONTHLY_LIMIT } from "@/lib/asaas";
import { TRIAL_ANAMNESIS_LIMIT } from "@/lib/billing";
import { formatBRDate } from "@/lib/date";
import type { Clinic } from "@/lib/database.types";
import styles from "@/components/admin/admin.module.css";

const STATUS_META: Record<string, { label: string; className: string }> = {
  trialing: { label: "Em trial", className: styles.statusOk },
  active: { label: "Em dia", className: styles.statusOk },
  past_due: { label: "Em atraso", className: styles.statusWarn },
  canceled: { label: "Cancelada", className: styles.statusDanger },
};

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

export default async function AdminClinicsPage() {
  if (!(await hasAdminSession())) redirect("/admin/login");

  const supabase = createSupabaseAdminClient();
  const { data } = await supabase.from("clinics").select("*").order("created_at", { ascending: false });
  const clinics = (data as Clinic[]) ?? [];

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const { data: monthlyAnamneses } = await supabase
    .from("anamneses")
    .select("clinic_id")
    .gte("created_at", startOfMonth.toISOString());

  const usageByClinic = new Map<string, number>();
  for (const a of monthlyAnamneses ?? []) {
    usageByClinic.set(a.clinic_id, (usageByClinic.get(a.clinic_id) ?? 0) + 1);
  }

  function usageFor(c: Clinic) {
    const used = usageByClinic.get(c.id) ?? 0;
    const limit = c.subscription_status === "trialing" ? TRIAL_ANAMNESIS_LIMIT : PLAN_MONTHLY_LIMIT[c.plan];
    return { used, limit, over: used > limit };
  }

  const stats = {
    total: clinics.length,
    active: clinics.filter((c) => c.subscription_status === "active").length,
    trialing: clinics.filter((c) => c.subscription_status === "trialing").length,
    attention: clinics.filter((c) => c.subscription_status === "past_due" || c.subscription_status === "canceled").length,
  };

  return (
    <AdminShell
      title="Clínicas"
      subtitle="Todas as clínicas cadastradas na plataforma"
      actions={
        <Link href="/admin/clinics/new" className={`${styles.btn} ${styles.btnPrimary}`}>
          + Nova clínica
        </Link>
      }
    >
      <div className={styles.statGrid}>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{stats.total}</div>
          <div className={styles.statLabel}>Total de clínicas</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{stats.active}</div>
          <div className={styles.statLabel}>Assinaturas em dia</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{stats.trialing}</div>
          <div className={styles.statLabel}>Em período de teste</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{stats.attention}</div>
          <div className={styles.statLabel}>Precisam de atenção</div>
        </div>
      </div>

      <div className={styles.panel}>
        {clinics.length === 0 ? (
          <div className={styles.emptyState}>Nenhuma clínica cadastrada ainda.</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Clínica</th>
                <th>Plano</th>
                <th>Uso este mês</th>
                <th>Status</th>
                <th>Trial até</th>
                <th>Criada em</th>
              </tr>
            </thead>
            <tbody>
              {clinics.map((c) => {
                const status = STATUS_META[c.subscription_status] ?? { label: c.subscription_status, className: "" };
                const usage = usageFor(c);
                return (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/admin/clinics/${c.id}`} style={{ textDecoration: "none" }}>
                        <div className={styles.rowMain}>
                          {c.logo_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={c.logo_url} alt="" className={styles.rowAvatar} />
                          ) : (
                            <div className={styles.rowAvatarPlaceholder}>{initials(c.name)}</div>
                          )}
                          <div>
                            <div className={styles.rowTitle}>{c.name}</div>
                            <div className={styles.rowMeta}>/{c.slug}</div>
                          </div>
                        </div>
                      </Link>
                    </td>
                    <td>
                      {PLAN_LABEL[c.plan]}
                      <div className={styles.rowMeta}>{c.billing_cycle === "yearly" ? "anual" : "mensal"}</div>
                      {c.pending_plan && (
                        <div style={{ fontSize: 11.5, color: "var(--warn)", fontWeight: 600, marginTop: 2 }}>
                          → {PLAN_LABEL[c.pending_plan]}
                        </div>
                      )}
                    </td>
                    <td>
                      <span style={{ fontWeight: 600, color: usage.over ? "var(--danger)" : "var(--ink)" }}>
                        {usage.used}/{usage.limit}
                      </span>
                      {usage.over && (
                        <div style={{ fontSize: 11.5, color: "var(--danger)", fontWeight: 600 }}>excedente</div>
                      )}
                    </td>
                    <td>
                      <span className={`${styles.statusDot} ${status.className}`}>{status.label}</span>
                    </td>
                    <td>{c.trial_ends_at ? formatBRDate(c.trial_ends_at) : "—"}</td>
                    <td>{formatBRDate(c.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </AdminShell>
  );
}
