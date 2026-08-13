import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ClinicShell } from "@/components/clinic/ClinicShell";
import { MessageTemplateEditor } from "@/components/MessageTemplateEditor";
import type { AppointmentMessageTemplateType } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

export default async function AppointmentMessageTemplatesPage() {
  const clinic = await getCurrentClinic();
  if (!clinic) redirect("/login");

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("appointment_message_templates")
    .select("template_type, body")
    .eq("clinic_id", clinic.id);

  const initialCustomized: Partial<Record<AppointmentMessageTemplateType, string>> = {};
  for (const row of data ?? []) {
    initialCustomized[row.template_type as AppointmentMessageTemplateType] = row.body;
  }

  return (
    <ClinicShell
      clinicName={clinic.name}
      clinicLogoUrl={clinic.logo_url}
      title="Modelos de mensagem"
      subtitle="Textos enviados por WhatsApp em cada momento do fluxo de agendamento"
      actions={
        <Link href="/dashboard/configuracoes" className={`${styles.btn} ${styles.btnGhost}`}>
          ← Voltar
        </Link>
      }
    >
      <MessageTemplateEditor clinicId={clinic.id} initialCustomized={initialCustomized} />
    </ClinicShell>
  );
}
