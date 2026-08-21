import { redirect } from "next/navigation";
import Link from "next/link";
import { getClinicAndRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ClinicShell } from "@/components/clinic/ClinicShell";
import { Pagination } from "@/components/ui/Pagination";
import { ClickableRow } from "@/components/ui/ClickableRow";
import { StopPropagationTd } from "@/components/ui/StopPropagation";
import { formatBRDate } from "@/lib/date";
import { DOCUMENT_STATUS_CLASS, DOCUMENT_STATUS_LABEL } from "@/lib/documentStatus";
import { startOfCurrentMonth } from "@/lib/usage";
import type { Prescription, PrescriptionTemplate } from "@/lib/database.types";
import { PatientAvatar } from "@/components/PatientAvatar";
import { NewPrescriptionTrigger } from "@/components/NewPrescriptionTrigger";
import { PrescriptionGridActions } from "@/components/PrescriptionGridActions";
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

export default async function PrescriptionsPage({ searchParams }: { searchParams: { q?: string; page?: string; new?: string } }) {
  const auth = await getClinicAndRole();
  if (!auth) redirect("/login");
  if (auth.role !== "owner") redirect("/dashboard");
  const { clinic, role, userEmail, userName, userAvatarUrl } = auth;

  const q = searchParams.q?.trim() ?? "";
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createSupabaseServerClient();

  const startOfMonth = startOfCurrentMonth();
  const [{ count: totalCount }, { count: totalThisMonth }, { data: templatesData }] = await Promise.all([
    supabase.from("prescriptions").select("id", { count: "exact", head: true }).eq("clinic_id", clinic.id),
    supabase
      .from("prescriptions")
      .select("id", { count: "exact", head: true })
      .eq("clinic_id", clinic.id)
      .gte("created_at", startOfMonth.toISOString()),
    supabase.from("prescription_templates").select("*").eq("clinic_id", clinic.id).order("name", { ascending: true }),
  ]);
  const templates = templatesData as PrescriptionTemplate[];
  const dentistConfigured = !!(clinic.dentist_name && clinic.dentist_cro && clinic.dentist_cro_uf);

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
      title="Receituários"
      subtitle="Receituários odontológicos emitidos pela clínica"
      role={role}
      userEmail={userEmail}
      userName={userName}
      userAvatarUrl={userAvatarUrl}
      actions={
        <div style={{ display: "flex", gap: 10 }}>
          <Link href="/dashboard/prescricoes/templates" className={`${styles.btn} ${styles.btnGhost}`}>
            Modelos de receituário
          </Link>
          <NewPrescriptionTrigger
            clinicId={clinic.id}
            templates={templates}
            dentistConfigured={dentistConfigured}
            className={`${styles.btn} ${styles.btnPrimary}`}
            autoOpen={searchParams.new === "1"}
          >
            + Novo receituário
          </NewPrescriptionTrigger>
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
          <p className={styles.panelHeaderTitle}>Todos os receituários</p>
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
            {q ? `Nenhum receituário encontrado pra "${q}".` : "Nenhum receituário emitido ainda."}
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
                    <td>
                      <span className={styles.rowMain}>
                        <PatientAvatar
                          clinicId={clinic.id}
                          patientId={p.patient_id}
                          name={p.patient_name}
                          size={28}
                          radius="7px"
                          tone="brand"
                          label={initials(p.patient_name)}
                        />
                        <span className={styles.rowTitle}>{p.patient_name}</span>
                      </span>
                    </td>
                    <td data-label="Data">{formatBRDate(p.created_at)}</td>
                    <td data-label="Itens">{p.items.length}</td>
                    <td data-label="Status">
                      <span className={`${styles.statusDot} ${styles[DOCUMENT_STATUS_CLASS[p.status]]}`}>
                        {DOCUMENT_STATUS_LABEL[p.status]}
                      </span>
                    </td>
                    <StopPropagationTd>
                      <PrescriptionGridActions clinicId={clinic.id} prescriptionId={p.id} status={p.status} hasPhone={!!p.patient_phone} />
                    </StopPropagationTd>
                  </ClickableRow>
                ))}
              </tbody>
            </table>
            <Pagination
              page={page}
              totalPages={totalPages}
              count={count ?? 0}
              itemLabel="receituário"
              itemLabelPlural="receituários"
              hrefFor={pageHref}
            />
          </>
        )}
      </div>
    </ClinicShell>
  );
}
