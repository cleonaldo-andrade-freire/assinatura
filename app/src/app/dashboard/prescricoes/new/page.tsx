import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ClinicShell } from "@/components/clinic/ClinicShell";
import { NewPrescriptionForm } from "@/components/NewPrescriptionForm";
import type { Patient, PrescriptionTemplate } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

export default async function NewPrescriptionPage({ searchParams }: { searchParams: { patientId?: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic) redirect("/login");

  const dentistConfigured = !!(clinic.dentist_name && clinic.dentist_cro && clinic.dentist_cro_uf);

  if (!dentistConfigured) {
    return (
      <ClinicShell clinicName={clinic.name} clinicLogoUrl={clinic.logo_url} title="Nova prescrição">
        <div className={styles.panel}>
          <div className={styles.panelBody}>
            <p style={{ margin: "0 0 14px" }}>
              Antes de emitir a primeira prescrição, cadastre o nome e o CRO do dentista responsável em
              Configurações.
            </p>
            <Link href="/dashboard/configuracoes" className={`${styles.btn} ${styles.btnPrimary}`}>
              Ir para Configurações
            </Link>
          </div>
        </div>
      </ClinicShell>
    );
  }

  const supabase = await createSupabaseServerClient();
  const [{ data: templates }, { data: patientData }] = await Promise.all([
    supabase.from("prescription_templates").select("*").eq("clinic_id", clinic.id).order("name", { ascending: true }),
    searchParams.patientId
      ? supabase.from("patients").select("*").eq("id", searchParams.patientId).eq("clinic_id", clinic.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const patient = patientData as Patient | null;

  return (
    <ClinicShell
      clinicName={clinic.name}
      clinicLogoUrl={clinic.logo_url}
      title="Nova prescrição"
      subtitle="A assinatura do dentista responsável é simulada nesta versão — ver aviso no PDF gerado"
    >
      <NewPrescriptionForm
        clinicId={clinic.id}
        templates={(templates as PrescriptionTemplate[]) ?? []}
        initialPatientId={patient?.id}
        initialPatientName={patient?.name}
        initialPatientCpf={patient?.cpf}
        initialPatientPhone={patient?.phone}
      />
    </ClinicShell>
  );
}
