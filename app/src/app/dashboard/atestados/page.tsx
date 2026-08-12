import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ClinicShell } from "@/components/clinic/ClinicShell";
import { formatBRDate } from "@/lib/date";
import { DOCUMENT_STATUS_CLASS, DOCUMENT_STATUS_LABEL } from "@/lib/documentStatus";
import { startOfCurrentMonth } from "@/lib/usage";
import type { Certificate } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

export default async function CertificatesPage() {
  const clinic = await getCurrentClinic();
  if (!clinic) redirect("/login");

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("certificates")
    .select("*")
    .eq("clinic_id", clinic.id)
    .order("created_at", { ascending: false });
  const certificates = (data as Certificate[]) ?? [];

  const startOfMonth = startOfCurrentMonth();
  const totalThisMonth = certificates.filter((c) => new Date(c.created_at) >= startOfMonth).length;

  return (
    <ClinicShell
      clinicName={clinic.name}
      clinicLogoUrl={clinic.logo_url}
      title="Atestados"
      subtitle="Atestados odontológicos emitidos pela clínica"
      actions={
        <div style={{ display: "flex", gap: 10 }}>
          <Link href="/dashboard/atestados/templates" className={`${styles.btn} ${styles.btnGhost}`}>
            Modelos de atestado
          </Link>
          <Link href="/dashboard/atestados/new" className={`${styles.btn} ${styles.btnPrimary}`}>
            + Novo atestado
          </Link>
        </div>
      }
    >
      <div className={styles.statGrid}>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{certificates.length}</div>
          <div className={styles.statLabel}>Total geral</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{totalThisMonth}</div>
          <div className={styles.statLabel}>Este mês</div>
        </div>
      </div>

      <div className={styles.panel}>
        {certificates.length === 0 ? (
          <div className={styles.emptyState}>Nenhum atestado emitido ainda.</div>
        ) : (
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
                <tr key={c.id}>
                  <td className={styles.rowTitle}>{c.patient_name}</td>
                  <td data-label="Data">{formatBRDate(c.created_at)}</td>
                  <td data-label="Dias de afastamento">{c.rest_days}</td>
                  <td data-label="Status">
                    <span className={`${styles.statusDot} ${styles[DOCUMENT_STATUS_CLASS[c.status]]}`}>
                      {DOCUMENT_STATUS_LABEL[c.status]}
                    </span>
                  </td>
                  <td>
                    <Link href={`/dashboard/atestados/${c.id}`}>Ver detalhes</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </ClinicShell>
  );
}
