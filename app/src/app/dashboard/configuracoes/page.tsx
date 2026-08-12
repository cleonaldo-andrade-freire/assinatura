import { redirect } from "next/navigation";
import { getCurrentClinic } from "@/lib/auth";
import { ClinicShell } from "@/components/clinic/ClinicShell";
import { ClinicProfileForm } from "@/components/ClinicProfileForm";
import { LogoUpload } from "@/components/LogoUpload";
import { ConnectWhatsApp } from "@/components/ConnectWhatsApp";
import styles from "@/styles/shell.module.css";

export default async function SettingsPage() {
  const clinic = await getCurrentClinic();
  if (!clinic) redirect("/login");

  return (
    <ClinicShell
      clinicName={clinic.name}
      clinicLogoUrl={clinic.logo_url}
      title="Configurações"
      subtitle="Dados do responsável técnico, WhatsApp e identidade visual da clínica"
    >
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <p className={styles.panelHeaderTitle}>Logo da clínica</p>
        </div>
        <div className={styles.panelBody}>
          <LogoUpload
            clinicId={clinic.id}
            currentLogoUrl={clinic.logo_url}
            uploadUrl={`/api/clinics/${clinic.id}/logo`}
          />
        </div>
      </div>

      <ClinicProfileForm clinicId={clinic.id} clinic={clinic} />

      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <p className={styles.panelHeaderTitle}>WhatsApp</p>
        </div>
        <div className={styles.panelBody}>
          <p className={styles.hint} style={{ marginBottom: 14 }}>
            Esse é o número usado em toda a comunicação com o paciente: é nele que a anamnese é respondida e é dele
            que saem as notificações da clínica (link de assinatura, atestado emitido, lembretes).
          </p>
          <ConnectWhatsApp clinicId={clinic.id} initialWhatsappNumber={clinic.whatsapp_number} />
        </div>
      </div>
    </ClinicShell>
  );
}
