import { notFound, redirect } from "next/navigation";
import { getClinicAndRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ClinicShell } from "@/components/clinic/ClinicShell";
import { ClickableRow } from "@/components/ui/ClickableRow";
import { fetchAll } from "@/lib/campaignsServer";
import { CAMPAIGN_AUDIENCE_LABEL, CAMPAIGN_DAILY_LIMIT, CAMPAIGN_STATUS_CLASS as STATUS_CLASS, CAMPAIGN_STATUS_LABEL } from "@/lib/campaigns";
import { formatTimestampBR } from "@/lib/date";
import type { MarketingCampaign } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

/** Campanhas de promoção por WhatsApp (migration 076) — só owner, só com o módulo ligado. */
export default async function CampanhasPage() {
  const auth = await getClinicAndRole();
  if (!auth) redirect("/login");
  if (auth.role !== "owner") redirect("/dashboard");
  const { clinic, role, userEmail, userName, userAvatarUrl } = auth;
  if (!clinic.campaigns_enabled) notFound();

  const supabase = await createSupabaseServerClient();
  const { data: campaignsData } = await supabase.from("marketing_campaigns").select("*").eq("clinic_id", clinic.id).order("created_at", { ascending: false });
  const campaigns = (campaignsData as MarketingCampaign[]) ?? [];

  const recipients = await fetchAll<{ campaign_id: string; status: string }>((from, to) =>
    supabase.from("marketing_campaign_recipients").select("campaign_id, status").eq("clinic_id", clinic.id).range(from, to)
  );
  const stats = new Map<string, { total: number; sent: number; yes: number; no: number }>();
  for (const r of recipients) {
    const s = stats.get(r.campaign_id) ?? { total: 0, sent: 0, yes: 0, no: 0 };
    s.total++;
    if (["sent", "interested", "declined", "replied"].includes(r.status)) s.sent++;
    if (r.status === "interested") s.yes++;
    if (r.status === "declined") s.no++;
    stats.set(r.campaign_id, s);
  }

  return (
    <ClinicShell
      clinicName={clinic.name}
      clinicLogoUrl={clinic.logo_url}
      title="Campanhas"
      subtitle="Promoções pelo WhatsApp — convite primeiro, conteúdo só para quem disser SIM"
      role={role}
      userEmail={userEmail}
      userName={userName}
      userAvatarUrl={userAvatarUrl}
      actions={
        <a href="/dashboard/campanhas/nova" className={`${styles.btn} ${styles.btnPrimary}`}>
          Nova campanha
        </a>
      }
    >
      <div style={{ padding: "12px 16px", background: "var(--surface-sunken)", borderRadius: 8, fontSize: 13.5, color: "var(--ink-soft)", marginBottom: 16 }}>
        Para proteger o número da clínica, os convites saem um a cada 4 a 7 minutos, de segunda a sexta das 9h às 18h (sem feriados nacionais), no
        máximo {CAMPAIGN_DAILY_LIMIT} por dia somando todas as campanhas. A campanha pausa sozinha se o WhatsApp começar a recusar envios.
      </div>

      <div className={styles.panel}>
        {campaigns.length === 0 ? (
          <div className={styles.emptyState}>Nenhuma campanha ainda. Comece por uma para pacientes já atendidos.</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Campanha</th>
                <th>Situação</th>
                <th>Convites</th>
                <th>SIM</th>
                <th>NÃO</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => {
                const s = stats.get(c.id) ?? { total: 0, sent: 0, yes: 0, no: 0 };
                return (
                  <ClickableRow key={c.id} href={`/dashboard/campanhas/${c.id}`}>
                    <td data-label="Campanha">
                      <div style={{ fontWeight: 600 }}>{c.name}</div>
                      <div style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>
                        {CAMPAIGN_AUDIENCE_LABEL[c.audience]} · criada em {formatTimestampBR(c.created_at)}
                      </div>
                    </td>
                    <td data-label="Situação">
                      <span className={`${styles.statusBadge} ${styles[STATUS_CLASS[c.status]]}`}>{CAMPAIGN_STATUS_LABEL[c.status]}</span>
                    </td>
                    <td data-label="Convites" style={{ fontVariantNumeric: "tabular-nums" }}>
                      {c.status === "rascunho" ? "—" : `${s.sent}/${s.total}`}
                    </td>
                    <td data-label="SIM" style={{ fontVariantNumeric: "tabular-nums" }}>
                      {s.yes}
                    </td>
                    <td data-label="NÃO" style={{ fontVariantNumeric: "tabular-nums" }}>
                      {s.no}
                    </td>
                  </ClickableRow>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </ClinicShell>
  );
}
