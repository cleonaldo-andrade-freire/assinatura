import { notFound, redirect } from "next/navigation";
import { getClinicAndRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ClinicShell } from "@/components/clinic/ClinicShell";
import { CampaignActions } from "@/components/campaigns/CampaignActions";
import { RecipientsTable } from "@/components/campaigns/RecipientsTable";
import { CAMPAIGN_AUDIENCE_LABEL, CAMPAIGN_STATUS_CLASS, CAMPAIGN_STATUS_LABEL } from "@/lib/campaigns";
import { formatBRDateTime } from "@/lib/date";
import type { CampaignRecipientStatus, MarketingCampaign, MarketingCampaignRecipient } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

const RECIPIENT_LIMIT = 1000;

async function countByStatus(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, campaignId: string, statuses: CampaignRecipientStatus[] | null) {
  let query = supabase.from("marketing_campaign_recipients").select("id", { count: "exact", head: true }).eq("campaign_id", campaignId);
  if (statuses) query = query.in("status", statuses);
  const { count } = await query;
  return count ?? 0;
}

export default async function CampanhaPage({ params }: { params: { id: string } }) {
  const auth = await getClinicAndRole();
  if (!auth) redirect("/login");
  if (auth.role !== "owner") redirect("/dashboard");
  const { clinic, role, userEmail, userName, userAvatarUrl } = auth;
  if (!clinic.campaigns_enabled) notFound();

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("marketing_campaigns").select("*").eq("id", params.id).eq("clinic_id", clinic.id).maybeSingle();
  const campaign = data as MarketingCampaign | null;
  if (!campaign) notFound();

  const [total, sent, yes, no, other, queued, { data: recipientsData }] = await Promise.all([
    countByStatus(supabase, campaign.id, null),
    countByStatus(supabase, campaign.id, ["sent", "interested", "declined", "replied"]),
    countByStatus(supabase, campaign.id, ["interested"]),
    countByStatus(supabase, campaign.id, ["declined"]),
    countByStatus(supabase, campaign.id, ["replied"]),
    countByStatus(supabase, campaign.id, ["pending", "sending"]),
    supabase
      .from("marketing_campaign_recipients")
      .select("*")
      .eq("campaign_id", campaign.id)
      .order("replied_at", { ascending: false, nullsFirst: false })
      .order("sent_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: true })
      .limit(RECIPIENT_LIMIT),
  ]);
  const recipients = (recipientsData as MarketingCampaignRecipient[]) ?? [];

  const stat = (label: string, value: string | number) => (
    <div className={styles.statCard}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue}>{value}</div>
    </div>
  );

  return (
    <ClinicShell
      clinicName={clinic.name}
      clinicLogoUrl={clinic.logo_url}
      title={campaign.name}
      subtitle={`${CAMPAIGN_AUDIENCE_LABEL[campaign.audience]}${campaign.only_attended && campaign.audience !== "leads" ? " (só já atendidos)" : ""}`}
      role={role}
      userEmail={userEmail}
      userName={userName}
      userAvatarUrl={userAvatarUrl}
      actions={<CampaignActions clinicId={clinic.id} campaignId={campaign.id} status={campaign.status} />}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <a href="/dashboard/campanhas" style={{ fontSize: 13.5 }}>
          ← Campanhas
        </a>
        <span className={`${styles.statusBadge} ${styles[CAMPAIGN_STATUS_CLASS[campaign.status]]}`}>{CAMPAIGN_STATUS_LABEL[campaign.status]}</span>
        {campaign.started_at && <span style={{ fontSize: 13, color: "var(--ink-soft)" }}>Iniciada em {formatBRDateTime(campaign.started_at)}</span>}
      </div>

      {campaign.pause_reason && campaign.status === "pausada" && (
        <div style={{ padding: 12, background: "var(--warn-tint)", borderRadius: 8, fontSize: 13.5, marginBottom: 14 }}>{campaign.pause_reason}</div>
      )}

      {campaign.status !== "rascunho" && (
        <div className={styles.statGrid} style={{ gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))" }}>
          {stat("Convites enviados", `${sent}/${total}`)}
          {stat("Na fila", queued)}
          {stat("SIM", yes)}
          {stat("NÃO", no)}
          {stat("Outras respostas", other)}
        </div>
      )}

      <div className={styles.panel} style={{ marginBottom: 16 }}>
        <div className={styles.panelBody} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20 }}>
          <div>
            <div className={styles.label}>Convite (vai para todos)</div>
            <p style={{ whiteSpace: "pre-wrap", fontSize: 14, margin: "6px 0 0" }}>{campaign.invite_text}</p>
          </div>
          <div>
            <div className={styles.label}>Conteúdo (só para quem disser SIM)</div>
            {campaign.media_key && campaign.media_type === "image" && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/clinics/${clinic.id}/campaigns/${campaign.id}/media`} alt="" style={{ maxWidth: 260, borderRadius: 8, display: "block", margin: "6px 0" }} />
            )}
            {campaign.media_key && campaign.media_type === "video" && (
              <video src={`/api/clinics/${clinic.id}/campaigns/${campaign.id}/media`} controls style={{ maxWidth: 260, borderRadius: 8, display: "block", margin: "6px 0" }} />
            )}
            <p style={{ whiteSpace: "pre-wrap", fontSize: 14, margin: "6px 0 0" }}>{campaign.content_text}</p>
          </div>
        </div>
      </div>

      {campaign.status === "rascunho" ? (
        <div className={styles.panel}>
          <div className={styles.emptyState}>A lista de contatos é montada quando você iniciar o envio — já sem quem pediu para sair.</div>
        </div>
      ) : (
        <RecipientsTable recipients={recipients} truncated={total > RECIPIENT_LIMIT} />
      )}
    </ClinicShell>
  );
}
