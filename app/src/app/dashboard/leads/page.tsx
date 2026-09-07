import { redirect } from "next/navigation";
import { getClinicAndRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ClinicShell } from "@/components/clinic/ClinicShell";
import { LeadsBoard } from "@/components/LeadsBoard";
import { NewLeadButton } from "@/components/NewLeadButton";
import { LeadsExportButton } from "@/components/LeadsExportButton";
import { LEAD_BOARD_STATUSES, backfillLeadNamesFromPatients } from "@/lib/leads";
import type { Lead } from "@/lib/database.types";

/** Lead 'scheduled' mais antigo que isto sai do quadro sozinho no próximo
 * carregamento da página — faxina lazy, sem cron (ver guia-deploy: cron no
 * Hobby é limitado a 1x/dia). */
const AUTO_ARCHIVE_SCHEDULED_DAYS = 45;

/** Teto de linhas nas listas de agendados/arquivados — o que passa disso é
 * histórico e não precisa aparecer na tela de triagem. */
const LIST_LIMIT = 50;

export default async function LeadsPage() {
  const auth = await getClinicAndRole();
  if (!auth) redirect("/login");
  const { clinic, role, userEmail, userName, userAvatarUrl } = auth;

  const supabase = await createSupabaseServerClient();

  // Faxina: agendados antigos saem do quadro antes de qualquer leitura.
  const autoArchiveCutoff = new Date(Date.now() - AUTO_ARCHIVE_SCHEDULED_DAYS * 86_400_000).toISOString();
  await supabase
    .from("leads")
    .update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("clinic_id", clinic.id)
    .eq("status", "scheduled")
    .is("archived_at", null)
    .lt("created_at", autoArchiveCutoff);

  // Leads "Sem nome ainda" cujo telefone já é de um paciente cadastrado
  // ganham o nome dele antes da leitura abaixo.
  await backfillLeadNamesFromPatients(supabase, clinic.id);

  const [openRes, scheduledRes, archivedRes] = await Promise.all([
    supabase
      .from("leads")
      .select("*")
      .eq("clinic_id", clinic.id)
      .in("status", LEAD_BOARD_STATUSES)
      .is("archived_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("leads")
      .select("*")
      .eq("clinic_id", clinic.id)
      .eq("status", "scheduled")
      .is("archived_at", null)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(LIST_LIMIT),
    supabase
      .from("leads")
      .select("*")
      .eq("clinic_id", clinic.id)
      .not("archived_at", "is", null)
      .order("archived_at", { ascending: false })
      .limit(LIST_LIMIT),
  ]);

  // Sem isso, uma query que falha (ex.: coluna de migration ainda não
  // aplicada) devolvia lista vazia e o quadro parecia só "sem leads".
  const loadError = openRes.error ?? scheduledRes.error ?? archivedRes.error;

  return (
    <ClinicShell
      clinicName={clinic.name}
      clinicLogoUrl={clinic.logo_url}
      title="Leads"
      subtitle="Triagem automática por IA no WhatsApp — números fora do fluxo de anamnese/agenda"
      role={role}
      userEmail={userEmail}
      userName={userName}
      userAvatarUrl={userAvatarUrl}
      actions={
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <LeadsExportButton clinicId={clinic.id} />
          <NewLeadButton clinicId={clinic.id} />
        </div>
      }
    >
      {loadError ? (
        <div
          style={{
            padding: 14,
            background: "var(--surface-sunken)",
            borderLeft: "4px solid var(--danger)",
            borderRadius: 8,
          }}
        >
          <p style={{ margin: 0, fontWeight: 600, color: "var(--danger)" }}>Não deu pra carregar os leads.</p>
          <p style={{ margin: "4px 0 0", fontSize: 13.5, color: "var(--ink-soft)" }}>{loadError.message}</p>
        </div>
      ) : (
        <LeadsBoard
          clinicId={clinic.id}
          role={role}
          openLeads={(openRes.data as Lead[]) ?? []}
          scheduledLeads={(scheduledRes.data as Lead[]) ?? []}
          archivedLeads={(archivedRes.data as Lead[]) ?? []}
          listLimit={LIST_LIMIT}
        />
      )}
    </ClinicShell>
  );
}
