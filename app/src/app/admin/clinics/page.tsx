import { redirect } from "next/navigation";
import Link from "next/link";
import { hasAdminSession } from "@/lib/adminSession";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { AdminShell } from "@/components/admin/AdminShell";
import { PLAN_LABEL } from "@/lib/asaas";
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
                <th>Status</th>
                <th>Trial até</th>
                <th>Criada em</th>
              </tr>
            </thead>
            <tbody>
              {clinics.map((c) => {
                const status = STATUS_META[c.subscription_status] ?? { label: c.subscription_status, className: "" };
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
                    </td>
                    <td>
                      <span className={`${styles.statusDot} ${status.className}`}>{status.label}</span>
                    </td>
                    <td>{c.trial_ends_at ? new Date(c.trial_ends_at).toLocaleDateString("pt-BR") : "—"}</td>
                    <td>{new Date(c.created_at).toLocaleDateString("pt-BR")}</td>
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
