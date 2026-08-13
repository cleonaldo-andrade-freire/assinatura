import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ClinicShell } from "@/components/clinic/ClinicShell";
import { ClickableRow } from "@/components/ui/ClickableRow";
import { QuestionTemplateRowActions } from "@/components/QuestionTemplateRowActions";
import type { QuestionTemplate } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

export default async function TemplatesPage() {
  const clinic = await getCurrentClinic();
  if (!clinic) redirect("/login");

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("question_templates")
    .select("*")
    .eq("clinic_id", clinic.id)
    .order("created_at", { ascending: false });
  const templates = (data as QuestionTemplate[]) ?? [];

  return (
    <ClinicShell
      clinicName={clinic.name}
      clinicLogoUrl={clinic.logo_url}
      title="Modelos de anamnese"
      subtitle="Cada modelo é uma lista de perguntas — escolha qual usar ao iniciar uma anamnese nova"
      actions={
        <div style={{ display: "flex", gap: 10 }}>
          <Link href="/dashboard/anamneses" className={`${styles.btn} ${styles.btnGhost}`}>
            ← Anamneses
          </Link>
          <Link href="/dashboard/templates/new" className={`${styles.btn} ${styles.btnPrimary}`}>
            + Novo modelo
          </Link>
        </div>
      }
    >
      <div className={styles.panel}>
        {templates.length === 0 ? (
          <div className={styles.emptyState}>Nenhum modelo cadastrado ainda.</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Perguntas</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <ClickableRow key={t.id} href={`/dashboard/templates/${t.id}`}>
                  <td className={styles.rowTitle}>{t.name}</td>
                  <td>{t.questions.length}</td>
                  <td>
                    <QuestionTemplateRowActions clinicId={clinic.id} templateId={t.id} />
                  </td>
                </ClickableRow>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </ClinicShell>
  );
}
