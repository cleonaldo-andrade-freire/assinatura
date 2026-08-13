import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentClinic } from "@/lib/auth";
import { ClinicShell } from "@/components/clinic/ClinicShell";
import { NewAppointmentForm } from "@/components/NewAppointmentForm";
import { brDateOnly } from "@/lib/date";
import styles from "@/styles/shell.module.css";

export default async function NewAppointmentPage({ searchParams }: { searchParams: { date?: string; time?: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic) redirect("/login");

  const date = searchParams.date && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date) ? searchParams.date : brDateOnly();

  return (
    <ClinicShell
      clinicName={clinic.name}
      clinicLogoUrl={clinic.logo_url}
      title="Novo agendamento"
      actions={
        <Link href="/dashboard/agenda" className={`${styles.btn} ${styles.btnGhost}`}>
          ← Voltar
        </Link>
      }
    >
      <NewAppointmentForm
        clinicId={clinic.id}
        professionalName={clinic.dentist_name || clinic.name}
        initialDate={date}
        initialTime={searchParams.time}
      />
    </ClinicShell>
  );
}
