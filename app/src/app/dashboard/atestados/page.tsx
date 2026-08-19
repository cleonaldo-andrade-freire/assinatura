import { redirect } from "next/navigation";
import Link from "next/link";
import { getClinicAndRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ClinicShell } from "@/components/clinic/ClinicShell";
import { Pagination } from "@/components/ui/Pagination";
import { ClickableRow } from "@/components/ui/ClickableRow";
import { StopPropagationLink } from "@/components/ui/StopPropagation";
import { formatBRDate } from "@/lib/date";
import { DOCUMENT_STATUS_CLASS, DOCUMENT_STATUS_LABEL } from "@/lib/documentStatus";
import { startOfCurrentMonth } from "@/lib/usage";
import type { Certificate, CertificateTemplate } from "@/lib/database.types";
import { PatientAvatar } from "@/components/PatientAvatar";
import { NewCertificateTrigger } from "@/components/NewCertificateTrigger";
import styles from "@/styles/shell.module.css";

const PAGE_SIZE = 10;

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

export default async function CertificatesPage({ searchParams }: { searchParams: { q?: string; page?: string } }) {
  const auth = await getClinicAndRole();
  if (!auth) redirect("/login");
  if (auth.role !== "owner") redirect("/dashboard");
  const { clinic, role, userEmail } = auth;

  const q = searchParams.q?.trim() ?? "";
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createSupabaseServerClient();

  const startOfMonth = startOfCurrentMonth();
  const [{ count: totalCount }, { count: totalThisMonth }, { data: templatesData }] = await Promise.all([
    supabase.from("certificates").select("id", { count: "exact", head: true }).eq("clinic_id", clinic.id),
    supabase
      .from("certificates")
      .select("id", { count: "exact", head: true })
      .eq("clinic_id", clinic.id)
      .gte("created_at", startOfMonth.toISOString()),
    supabase.from("certificate_templates").select("*").eq("clinic_id", clinic.id).order("name", { ascending: true }),
  ]);
  const templates = templatesData as CertificateTemplate[];
  const dentistConfigured = !!(clinic.dentist_name && clinic.dentist_cro && clinic.dentist_cro_uf);

  let query = supabase.from("certificates").select("*", { count: "exact" }).eq("clinic_id", clinic.id);
  if (q) query = query.ilike("patient_name", `%${q}%`);
  const { data, count } = await query.order("created_at", { ascending: false }).range(from, to);
  const certificates = (data as Certificate[]) ?? [];
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  function pageHref(p: number) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    params.set("page", String(p));
    return `/dashboard/atestados?${params.toString()}`;
  }

  return (
    <ClinicShell
      clinicName={clinic.name}
      clinicLogoUrl={clinic.logo_url}
      title="Atestados"
      subtitle="Atestados odontológicos emitidos pela clínica"
      role={role}
      userEmail={userEmail}
      actions={
        <div style={{ display: "flex", gap: 10 }}>
          <Link href="/dashboard/atestados/templates" className={`${styles.btn} ${styles.btnGhost}`}>
            Modelos de atestado
          </Link>
          <NewCertificateTrigger
            clinicId={clinic.id}
            templates={templates}
            dentistConfigured={dentistConfigured}
            className={`${styles.btn} ${styles.btnPrimary}`}
          >
            + Novo atestado
          </NewCertificateTrigger>
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
          <p className={styles.panelHeaderTitle}>Todos os atestados</p>
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

        {certificates.length === 0 ? (
          <div className={styles.emptyState}>
            {q ? `Nenhum atestado encontrado pra "${q}".` : "Nenhum atestado emitido ainda."}
          </div>
        ) : (
          <>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Paciente</th>
                  <th>Data</th>
                  <th>Dias de afastamento</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {certificates.map((c) => (
                  <ClickableRow key={c.id} href={`/dashboard/atestados/${c.id}`}>
                    <td>
                      <span className={styles.rowMain}>
                        <PatientAvatar
                          clinicId={clinic.id}
                          patientId={c.patient_id}
                          name={c.patient_name}
                          size={28}
                          radius="7px"
                          tone="brand"
                          label={initials(c.patient_name)}
                        />
                        <span className={styles.rowTitle}>{c.patient_name}</span>
                      </span>
                    </td>
                    <td data-label="Data">{formatBRDate(c.created_at)}</td>
                    <td data-label="Dias de afastamento">{c.rest_days}</td>
                    <td data-label="Status">
                      <span className={`${styles.statusDot} ${styles[DOCUMENT_STATUS_CLASS[c.status]]}`}>
                        {DOCUMENT_STATUS_LABEL[c.status]}
                      </span>
                    </td>
                    <td>
                      <StopPropagationLink href={`/dashboard/atestados/${c.id}`}>Ver detalhes</StopPropagationLink>
                    </td>
                  </ClickableRow>
                ))}
              </tbody>
            </table>
            <Pagination page={page} totalPages={totalPages} count={count ?? 0} itemLabel="atestado" hrefFor={pageHref} />
          </>
        )}
      </div>
    </ClinicShell>
  );
}
