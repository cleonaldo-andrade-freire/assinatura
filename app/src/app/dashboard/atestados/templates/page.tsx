import { redirect } from "next/navigation";
import Link from "next/link";
import { getClinicAndRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ClinicShell } from "@/components/clinic/ClinicShell";
import { Pagination } from "@/components/ui/Pagination";
import { ClickableRow } from "@/components/ui/ClickableRow";
import { CertificateTemplateRowActions } from "@/components/CertificateTemplateRowActions";
import type { CertificateTemplate } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

const PAGE_SIZE = 10;

export default async function CertificateTemplatesPage({
  searchParams,
}: {
  searchParams: { q?: string; page?: string };
}) {
  const auth = await getClinicAndRole();
  if (!auth) redirect("/login");
  if (auth.role !== "owner") redirect("/dashboard");
  const { clinic, role, userEmail, userName, userAvatarUrl } = auth;

  const q = searchParams.q?.trim() ?? "";
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createSupabaseServerClient();
  let query = supabase.from("certificate_templates").select("*", { count: "exact" }).eq("clinic_id", clinic.id);
  if (q) query = query.ilike("name", `%${q}%`);
  const { data, count } = await query.order("name", { ascending: true }).range(from, to);
  const templates = (data as CertificateTemplate[]) ?? [];
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  function pageHref(p: number) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    params.set("page", String(p));
    return `/dashboard/atestados/templates?${params.toString()}`;
  }

  return (
    <ClinicShell
      clinicName={clinic.name}
      clinicLogoUrl={clinic.logo_url}
      title="Modelos de atestado"
      subtitle="Textos reaproveitáveis com dados do paciente mesclados automaticamente"
      role={role}
      userEmail={userEmail}
      userName={userName}
      userAvatarUrl={userAvatarUrl}
      actions={
        <div style={{ display: "flex", gap: 10 }}>
          <Link href="/dashboard/atestados" className={`${styles.btn} ${styles.btnGhost}`}>
            ← Atestados
          </Link>
          <Link href="/dashboard/atestados/templates/new" className={`${styles.btn} ${styles.btnPrimary}`}>
            + Novo modelo
          </Link>
        </div>
      }
    >
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <p className={styles.panelHeaderTitle}>Todos os modelos</p>
          <form method="GET" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div className={styles.searchBox}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.7" />
                <path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
              <input
                type="text"
                name="q"
                defaultValue={q}
                placeholder="Buscar por nome…"
                className={styles.searchInput}
              />
            </div>
            <button type="submit" className={`${styles.btn} ${styles.btnGhost}`}>
              Buscar
            </button>
          </form>
        </div>

        {templates.length === 0 ? (
          <div className={styles.emptyState}>
            {q ? `Nenhum modelo encontrado pra "${q}".` : "Nenhum modelo cadastrado ainda."}
          </div>
        ) : (
          <>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Dias padrão</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => (
                  <ClickableRow key={t.id} href={`/dashboard/atestados/templates/${t.id}`}>
                    <td className={styles.rowTitle}>{t.name}</td>
                    <td>{t.rest_days_default ?? "—"}</td>
                    <td>
                      <CertificateTemplateRowActions clinicId={clinic.id} templateId={t.id} />
                    </td>
                  </ClickableRow>
                ))}
              </tbody>
            </table>
            <Pagination page={page} totalPages={totalPages} count={count ?? 0} itemLabel="modelo" hrefFor={pageHref} />
          </>
        )}
      </div>
    </ClinicShell>
  );
}
