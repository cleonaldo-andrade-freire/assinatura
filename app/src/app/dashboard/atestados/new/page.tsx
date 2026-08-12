import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ClinicShell } from "@/components/clinic/ClinicShell";
import { NewCertificateForm } from "@/components/NewCertificateForm";
import type { CertificateTemplate } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

export default async function NewCertificatePage() {
  const clinic = await getCurrentClinic();
  if (!clinic) redirect("/login");

  const dentistConfigured = !!(clinic.dentist_name && clinic.dentist_cro && clinic.dentist_cro_uf);

  if (!dentistConfigured) {
    return (
      <ClinicShell clinicName={clinic.name} clinicLogoUrl={clinic.logo_url} title="Novo atestado">
        <div className={styles.panel}>
          <div className={styles.panelBody}>
            <p style={{ margin: "0 0 14px" }}>
              Antes de emitir o primeiro atestado, cadastre o nome e o CRO do dentista responsável em
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
  const { data: templates } = await supabase
    .from("certificate_templates")
    .select("*")
    .eq("clinic_id", clinic.id)
    .order("name", { ascending: true });

  return (
    <ClinicShell
      clinicName={clinic.name}
      clinicLogoUrl={clinic.logo_url}
      title="Novo atestado"
      subtitle="A assinatura do dentista responsável é simulada nesta versão — ver aviso no PDF gerado"
    >
      <NewCertificateForm clinicId={clinic.id} templates={(templates as CertificateTemplate[]) ?? []} />
    </ClinicShell>
  );
}
