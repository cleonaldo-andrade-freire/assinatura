import { ProsthesisOrderActions } from "@/components/ProsthesisOrderActions";
import { PatientAvatar } from "@/components/PatientAvatar";
import { PROSTHESIS_STAGE_LABEL } from "@/lib/prosthesisTemplates";
import { formatBRDate, formatBRDateTime } from "@/lib/date";
import { formatBRPhoneLocal } from "@/lib/validation";
import type { ProsthesisOrder, ProsthesisOrderEvent } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

function detailRow(label: string, value: React.ReactNode) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
      <span style={{ color: "var(--ink-soft)", fontSize: 13.5 }}>{label}</span>
      <span style={{ fontSize: 13.5, textAlign: "right" }}>{value}</span>
    </div>
  );
}

/**
 * Conteúdo do detalhe de prótese, sem a moldura ao redor — reaproveitado
 * pela página cheia (`/dashboard/proteses/[id]`, acesso direto/F5/link
 * compartilhado) e pelo modal (`@modal/(.)[id]`, aberto por cima do quadro
 * kanban ao navegar de dentro dele).
 */
export function ProsthesisOrderDetailBody({
  clinicId,
  order: o,
  events,
  compact,
}: {
  clinicId: string;
  order: ProsthesisOrder;
  events: ProsthesisOrderEvent[];
  /** Usado dentro do modal — o wrapper lá já espaça os cards por `gap`, então
   * cancela o `margin-bottom` próprio do `.panel` (senão soma os dois e
   * sobra espaço em branco entre os cards). */
  compact?: boolean;
}) {
  const panelStyle = compact ? { marginBottom: 0 } : undefined;
  return (
    <>
      <div className={styles.panel} style={panelStyle}>
        <div className={styles.panelHeader}>
          <p className={styles.panelHeaderTitle}>Serviço</p>
        </div>
        <div className={styles.panelBody}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 14, marginBottom: 4, borderBottom: "1px solid var(--line)" }}>
            <PatientAvatar clinicId={clinicId} patientId={o.patient_id} name={o.patient_name} size={52} />
            <div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{o.patient_name}</div>
              <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>+55 {formatBRPhoneLocal(o.patient_phone)}</div>
            </div>
          </div>
          {!o.patient_id && (
            <div style={{ padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
              <span style={{ fontSize: 12.5, color: "var(--ink-faint)" }}>Ainda não é paciente cadastrado nesta clínica.</span>
            </div>
          )}
          {detailRow("Descrição", o.description)}
          {detailRow("Estágio atual", PROSTHESIS_STAGE_LABEL[o.stage])}
          {detailRow("Neste estágio desde", formatBRDateTime(o.stage_since, "medium"))}
          {detailRow("Previsão de entrega", o.expected_delivery_date ? formatBRDate(`${o.expected_delivery_date}T12:00:00-03:00`) : "Não informada")}
          {o.notes && detailRow("Observação", o.notes)}
        </div>
      </div>

      <div className={styles.panel} style={panelStyle}>
        <div className={styles.panelHeader}>
          <p className={styles.panelHeaderTitle}>Mover de estágio</p>
        </div>
        <div className={styles.panelBody}>
          <ProsthesisOrderActions clinicId={clinicId} orderId={o.id} stage={o.stage} />
        </div>
      </div>

      <div className={styles.panel} style={panelStyle}>
        <div className={styles.panelHeader}>
          <p className={styles.panelHeaderTitle}>Histórico</p>
        </div>
        <div className={styles.panelBody}>
          {events.length === 0 ? (
            <p style={{ color: "var(--ink-soft)", fontSize: 13.5, margin: 0 }}>Sem eventos registrados ainda.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {events.map((e) => (
                <div key={e.id} style={{ fontSize: 13, color: "var(--ink-soft)" }}>
                  <strong style={{ color: "var(--ink)" }}>
                    {e.from_stage ? `${PROSTHESIS_STAGE_LABEL[e.from_stage]} → ${PROSTHESIS_STAGE_LABEL[e.to_stage]}` : `Entrou em ${PROSTHESIS_STAGE_LABEL[e.to_stage]}`}
                  </strong>
                  {" — "}
                  {formatBRDateTime(e.created_at, "medium")}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
