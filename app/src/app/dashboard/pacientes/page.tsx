import { redirect } from "next/navigation";
import Link from "next/link";
import { getClinicAndRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ClinicShell } from "@/components/clinic/ClinicShell";
import { Pagination } from "@/components/ui/Pagination";
import { ClickableRow } from "@/components/ui/ClickableRow";
import { PatientRowActions } from "@/components/PatientRowActions";
import { PatientAvatar } from "@/components/PatientAvatar";
import { NewPatientTrigger } from "@/components/NewPatientTrigger";
import { formatBRPhoneLocal } from "@/lib/validation";
import type { Patient } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

const PAGE_SIZE = 10;

export default async function PatientsPage({ searchParams }: { searchParams: { q?: string; page?: string } }) {
  const auth = await getClinicAndRole();
  if (!auth) redirect("/login");
  const { clinic, role, userEmail, userName, userAvatarUrl } = auth;

  const q = searchParams.q?.trim() ?? "";
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createSupabaseServerClient();
  let query = supabase.from("patients").select("*", { count: "exact" }).eq("clinic_id", clinic.id);
  if (q) query = query.ilike("name", `%${q}%`);
  const { data, count } = await query.order("name", { ascending: true }).range(from, to);
  const patients = (data as Patient[]) ?? [];
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  function pageHref(p: number) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    params.set("page", String(p));
    return `/dashboard/pacientes?${params.toString()}`;
  }

  return (
    <ClinicShell
      clinicName={clinic.name}
      clinicLogoUrl={clinic.logo_url}
      title="Pacientes"
      subtitle="Cadastro de pacientes da clínica"
      role={role}
      userEmail={userEmail}
      userName={userName}
      userAvatarUrl={userAvatarUrl}
      actions={
        <NewPatientTrigger clinicId={clinic.id} className={`${styles.btn} ${styles.btnPrimary}`}>
          + Novo paciente
        </NewPatientTrigger>
      }
    >
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <p className={styles.panelHeaderTitle}>Todos os pacientes</p>
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

        {patients.length === 0 ? (
          <div className={styles.emptyState}>
            {q ? `Nenhum paciente encontrado pra "${q}".` : "Nenhum paciente cadastrado ainda."}
          </div>
        ) : (
          <>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>CPF</th>
                  <th>WhatsApp</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {patients.map((p) => (
                  <ClickableRow key={p.id} href={`/dashboard/pacientes/${p.id}`}>
                    <td className={styles.rowTitle}>
                      <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <PatientAvatar clinicId={clinic.id} patientId={p.id} name={p.name} size={30} />
                        {p.name}
                      </span>
                    </td>
                    <td data-label="CPF">{p.cpf ?? "—"}</td>
                    <td data-label="WhatsApp">{p.phone ? formatBRPhoneLocal(p.phone) : "—"}</td>
                    <td>
                      <PatientRowActions clinicId={clinic.id} patientId={p.id} />
                    </td>
                  </ClickableRow>
                ))}
              </tbody>
            </table>
            <Pagination page={page} totalPages={totalPages} count={count ?? 0} itemLabel="paciente" hrefFor={pageHref} />
          </>
        )}
      </div>
    </ClinicShell>
  );
}
