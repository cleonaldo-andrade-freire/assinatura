import { redirect } from "next/navigation";
import { getCurrentClinic } from "@/lib/auth";
import { ClinicShell } from "@/components/clinic/ClinicShell";
import { ConnectWhatsApp } from "@/components/ConnectWhatsApp";
import styles from "@/styles/shell.module.css";

export default async function WhatsappPage() {
  const clinic = await getCurrentClinic();
  if (!clinic) redirect("/login");

  return (
    <ClinicShell
      clinicName={clinic.name}
      clinicLogoUrl={clinic.logo_url}
      title="WhatsApp"
      subtitle="É esse número que o paciente vai usar pra responder a anamnese"
    >
      <div className={styles.panel}>
        <div className={styles.panelBody}>
          <ConnectWhatsApp clinicId={clinic.id} initialWhatsappNumber={clinic.whatsapp_number} />
        </div>
      </div>
    </ClinicShell>
  );
}
