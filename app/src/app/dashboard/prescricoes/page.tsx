import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ClinicShell } from "@/components/clinic/ClinicShell";
import { Pagination } from "@/components/ui/Pagination";
import { ClickableRow } from "@/components/ui/ClickableRow";
import { formatBRDate } from "@/lib/date";
import { DOCUMENT_STATUS_CLASS, DOCUMENT_STATUS_LABEL } from "@/lib/documentStatus";
import { startOfCurrentMonth } from "@/lib/usage";
import type { Prescription } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

const PAGE_SIZE = 10;

export default async function PrescriptionsPage({ searchParams }: { searchParams: { q?: string; page?: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic) redirect("/login");

  const q = searchParams.q?.trim() ?? "";
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createSupabaseServerClient();

  const startOfMonth = startOfCurrentMonth();
  const [{ count: totalCount }, { count: totalThisMonth }] = await Promise.all([
    supabase.from("prescriptions").select("id", { count: "exact", head: true }).eq("clinic_id", clinic.id),
    supabase
      .from("prescriptions")
      .select("id", { count: "exact", head: true })
      .eq("clinic_id", clinic.id)
      .gte("created_at", startOfMonth.toISOString()),
  ]);

  let query = supabase.from("prescriptions").select("*", { count: "exact" }).eq("clinic_id", clinic.id);
  if (q) query = query.ilike("patient_name", `%${q}%`);
  const { data, count } = await query.order("created_at", { ascending: false }).range(from, to);
  const prescriptions = (data as Prescription[]) ?? [];
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  function pageHref(p: number) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    params.set("page", String(p));
    return `/dashboard/prescricoes?${params.toString()}`;
  }

  return (
    <ClinicShell
      clinicName={clinic.name}
      clinicLogoUrl={clinic.logo_url}
      title="Prescrições"
      subtitle="Prescrições odontológicas emitidas pela clínica"
      actions={
        <div style={{ display: "flex", gap: 10 }}>
          <Link href="/dashboard/prescricoes/templates" className={`${styles.btn} ${styles.btnGhost}`}>
            Modelos de prescrição
          </Link>
          <Link href="/dashboard/prescricoes/new" className={`${styles.btn} ${styles.btnPrimary}`}>
            + Nova prescrição
          </Link>
        </div>
      }
    >
      <div className={styles.statGrid}>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{totalCount ?? 0}</div>
          <div className={styles.statLabel}>Total geral</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{totalThisMonth ?? 0}</div>
          <div className={styles.statLabel}>Este mês</div>
        </div>
      </div>

      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <p className={styles.panelHeaderTitle}>Todas as prescrições</p>
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
                placeholder="Buscar por paciente…"
                className={styles.searchInput}
              />
            </div>
            <button type="submit" className={`${styles.btn} ${styles.btnGhost}`}>
              Buscar
            </button>
          </form>
        </div>

        {prescriptions.length === 0 ? (
          <div className={styles.emptyState}>
            {q ? `Nenhuma prescrição encontrada pra "${q}".` : "Nenhuma prescrição emitida ainda."}
          </div>
        ) : (
          <>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Paciente</th>
                  <th>Data</th>
                  <th>Itens</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {prescriptions.map((p) => (
                  <ClickableRow key={p.id} href={`/dashboard/prescricoes/${p.id}`}>
                    <td className={styles.rowTitle}>{p.patient_name}</td>
                    <td data-label="Data">{formatBRDate(p.created_at)}</td>
                    <td data-label="Itens">{p.items.length}</td>
                    <td data-label="Status">
                      <span className={`${styles.statusDot} ${styles[DOCUMENT_STATUS_CLASS[p.status]]}`}>
                        {DOCUMENT_STATUS_LABEL[p.status]}
                      </span>
                    </td>
                    <td>
                      <Link href={`/dashboard/prescricoes/${p.id}`} onClick={(e) => e.stopPropagation()}>
                        Ver detalhes
                      </Link>
                    </td>
                  </ClickableRow>
                ))}
              </tbody>
            </table>
            <Pagination
              page={page}
              totalPages={totalPages}
              count={count ?? 0}
              itemLabel="prescrição"
              itemLabelPlural="prescrições"
              hrefFor={pageHref}
            />
          </>
        )}
      </div>
    </ClinicShell>
  );
}
