import { redirect } from "next/navigation";
import Link from "next/link";
import { getClinicAndRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ClinicShell } from "@/components/clinic/ClinicShell";
import { ProsthesisTemplateEditor } from "@/components/ProsthesisTemplateEditor";
import type { ProsthesisStage } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

export default async function ProsthesisMessageTemplatesPage() {
  const auth = await getClinicAndRole();
  if (!auth) redirect("/login");
  if (auth.role !== "owner") redirect("/dashboard");
  const { clinic, role, userEmail, userName, userAvatarUrl } = auth;

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("prosthesis_stage_templates").select("stage, body").eq("clinic_id", clinic.id);

  const initialCustomized: Partial<Record<ProsthesisStage, string>> = {};
  for (const row of data ?? []) {
    initialCustomized[row.stage as ProsthesisStage] = row.body;
  }

  return (
    <ClinicShell
      clinicName={clinic.name}
      clinicLogoUrl={clinic.logo_url}
      title="Modelos de mensagem — Prótese"
      subtitle="Textos enviados por WhatsApp quando o serviço muda de estágio"
      role={role}
      userEmail={userEmail}
      userName={userName}
      userAvatarUrl={userAvatarUrl}
      actions={
        <Link href="/dashboard/configuracoes" className={`${styles.btn} ${styles.btnGhost}`}>
          ← Voltar
        </Link>
      }
    >
      <ProsthesisTemplateEditor clinicId={clinic.id} initialCustomized={initialCustomized} />
    </ClinicShell>
  );
}
