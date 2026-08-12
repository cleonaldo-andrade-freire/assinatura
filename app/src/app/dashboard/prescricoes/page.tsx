import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ClinicShell } from "@/components/clinic/ClinicShell";
import { formatBRDate } from "@/lib/date";
import { DOCUMENT_STATUS_CLASS, DOCUMENT_STATUS_LABEL } from "@/lib/documentStatus";
import { startOfCurrentMonth } from "@/lib/usage";
import type { Prescription } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

export default async function PrescriptionsPage() {
  const clinic = await getCurrentClinic();
  if (!clinic) redirect("/login");

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("prescriptions")
    .select("*")
    .eq("clinic_id", clinic.id)
    .order("created_at", { ascending: false });
  const prescriptions = (data as Prescription[]) ?? [];

  const startOfMonth = startOfCurrentMonth();
  const totalThisMonth = prescriptions.filter((p) => new Date(p.created_at) >= startOfMonth).length;

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
          <div className={styles.statValue}>{prescriptions.length}</div>
          <div className={styles.statLabel}>Total geral</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{totalThisMonth}</div>
          <div className={styles.statLabel}>Este mês</div>
        </div>
      </div>

      <div className={styles.panel}>
        {prescriptions.length === 0 ? (
          <div className={styles.emptyState}>Nenhuma prescrição emitida ainda.</div>
        ) : (
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
                <tr key={p.id}>
                  <td className={styles.rowTitle}>{p.patient_name}</td>
                  <td data-label="Data">{formatBRDate(p.created_at)}</td>
                  <td data-label="Itens">{p.items.length}</td>
                  <td data-label="Status">
                    <span className={`${styles.statusDot} ${styles[DOCUMENT_STATUS_CLASS[p.status]]}`}>
                      {DOCUMENT_STATUS_LABEL[p.status]}
                    </span>
                  </td>
                  <td>
                    <Link href={`/dashboard/prescricoes/${p.id}`}>Ver detalhes</Link>
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
