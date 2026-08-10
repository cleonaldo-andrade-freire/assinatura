import { redirect } from "next/navigation";
import Link from "next/link";
import { hasAdminSession } from "@/lib/adminSession";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getAllPlans } from "@/lib/plans";
import { AdminShell } from "@/components/admin/AdminShell";
import { DeletePlanButton } from "@/components/admin/DeletePlanButton";
import styles from "@/components/admin/admin.module.css";

export default async function AdminPlansPage() {
  if (!(await hasAdminSession())) redirect("/admin/login");

  const supabase = createSupabaseAdminClient();
  const plans = await getAllPlans(supabase);

  return (
    <AdminShell
      title="Planos"
      subtitle="Preços e limites disponíveis — a landing pública e o cadastro de clínicas usam esses valores direto"
      actions={
        <Link href="/admin/plans/new" className={`${styles.btn} ${styles.btnPrimary}`}>
          + Novo plano
        </Link>
      }
    >
      <div className={styles.panel}>
        {plans.length === 0 ? (
          <div className={styles.emptyState}>Nenhum plano cadastrado ainda.</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Preço/mês</th>
                <th>Limite</th>
                <th>Ordem</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div className={styles.rowTitle}>
                      {p.name} {p.featured && <span style={{ color: "var(--brand)", fontSize: 12 }}>★ popular</span>}
                    </div>
                    <div className={styles.rowMeta}>/{p.id}</div>
                  </td>
                  <td>R$ {p.monthly_price.toFixed(2).replace(".", ",")}</td>
                  <td>{p.monthly_limit} anamneses</td>
                  <td>{p.display_order}</td>
                  <td>
                    {p.active ? (
                      <span className={`${styles.statusDot} ${styles.statusOk}`}>Ativo</span>
                    ) : (
                      <span className={`${styles.statusDot} ${styles.statusDanger}`}>Inativo</span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      <Link href={`/admin/plans/${p.id}`} className={`${styles.btn} ${styles.btnGhost}`} style={{ padding: "6px 10px", fontSize: 12.5 }}>
                        Editar
                      </Link>
                      <DeletePlanButton planId={p.id} planName={p.name} />
                    </div>
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
