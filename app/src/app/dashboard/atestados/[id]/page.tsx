import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ClinicShell } from "@/components/clinic/ClinicShell";
import { CertificateActions } from "@/components/CertificateActions";
import { formatBRDate, formatBRDateTime } from "@/lib/date";
import { formatBRPhoneLocal } from "@/lib/validation";
import { resolveReasonSegments } from "@/lib/documentReason";
import { formatValidationCode } from "@/lib/validationCode";
import type { Certificate } from "@/lib/database.types";
import { isRealSignatureProvider, signatureProviderLabel } from "@/lib/signature/providerLabel";
import styles from "@/styles/shell.module.css";

function detailRow(label: string, value: React.ReactNode) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
      <span style={{ color: "var(--ink-soft)", fontSize: 13.5 }}>{label}</span>
      <span style={{ fontSize: 13.5, textAlign: "right", wordBreak: "break-all" }}>{value}</span>
    </div>
  );
}

export default async function CertificateDetailPage({ params }: { params: { id: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic) redirect("/login");

  const supabase = await createSupabaseServerClient();
  const { data: certificate } = await supabase
    .from("certificates")
    .select("*")
    .eq("id", params.id)
    .eq("clinic_id", clinic.id)
    .maybeSingle();
  if (!certificate) notFound();
  const c = certificate as Certificate;
  const reasonSegments = resolveReasonSegments(c.reason, {
    paciente_nome: c.patient_name,
    paciente_cpf: c.patient_cpf ?? "",
    data_emissao: formatBRDate(c.created_at),
    data_inicio: formatBRDate(`${c.starts_on}T12:00:00-03:00`),
    dias_afastamento: String(c.rest_days),
  });

  return (
    <ClinicShell
      clinicName={clinic.name}
      clinicLogoUrl={clinic.logo_url}
      title={c.patient_name}
      subtitle={`Atestado emitido em ${formatBRDate(c.created_at)}`}
      actions={
        <Link href="/dashboard/atestados" className={`${styles.btn} ${styles.btnGhost}`}>
          ← Voltar
        </Link>
      }
    >
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <p className={styles.panelHeaderTitle}>Dados do atestado</p>
        </div>
        <div className={styles.panelBody}>
          {detailRow("Paciente", c.patient_name)}
          {c.patient_cpf && detailRow("CPF", c.patient_cpf)}
          {c.patient_phone && detailRow("WhatsApp", `+55 ${formatBRPhoneLocal(c.patient_phone)}`)}
          {detailRow("Dentista responsável", `${c.dentist_name} — CRO ${c.dentist_cro}/${c.dentist_cro_uf}`)}
          {detailRow("Início do afastamento", formatBRDate(`${c.starts_on}T12:00:00-03:00`))}
          {detailRow("Dias de afastamento", String(c.rest_days))}
          {/* CID sempre visível aqui pra clínica — a flag `hide_cid_on_patient_pdf`
              só controla o que aparece no PDF entregue ao paciente. */}
          {c.cid && detailRow("CID (registro interno)", c.cid + (c.hide_cid_on_patient_pdf ? " — oculto no PDF do paciente" : ""))}
          <div style={{ padding: "10px 0" }}>
            <span style={{ color: "var(--ink-soft)", fontSize: 13.5, display: "block", marginBottom: 4 }}>Texto do atestado</span>
            <span style={{ fontSize: 14 }}>
              {reasonSegments.map((seg, i) =>
                seg.variable ? <strong key={i}>{seg.text}</strong> : <span key={i}>{seg.text}</span>
              )}
            </span>
          </div>
        </div>
      </div>

      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <p className={styles.panelHeaderTitle}>Assinatura</p>
        </div>
        <div className={styles.panelBody}>
          {c.signature_provider === "certisign" ? (
            c.status === "assinado" ? (
              <div
                style={{
                  background: "#e3f3e6",
                  border: "1px solid #b8ddc0",
                  color: "#1e5e2f",
                  borderRadius: "var(--radius-sm)",
                  padding: "12px 14px",
                  fontSize: 13.5,
                  marginBottom: 16,
                }}
              >
                ✅ Assinado digitalmente com certificado ICP-Brasil A3 em nuvem (Certisign).
              </div>
            ) : c.status === "aguardando_assinatura" ? (
              <div
                style={{
                  background: "#e7eef9",
                  border: "1px solid #b9cbea",
                  color: "#1f3f70",
                  borderRadius: "var(--radius-sm)",
                  padding: "12px 14px",
                  fontSize: 13.5,
                  marginBottom: 16,
                }}
              >
                ⏳ Aguardando a dentista confirmar a assinatura no app Certisign (PIN/biometria). Esta página atualiza
                sozinha quando ela confirmar.
              </div>
            ) : null
          ) : c.status === "assinado" && isRealSignatureProvider(c.signature_provider) ? (
            <div
              style={{
                background: "#e3f3e6",
                border: "1px solid #b8ddc0",
                color: "#1e5e2f",
                borderRadius: "var(--radius-sm)",
                padding: "12px 14px",
                fontSize: 13.5,
                marginBottom: 16,
              }}
            >
              ✅ Assinado digitalmente com {signatureProviderLabel(c.signature_provider)}.
            </div>
          ) : (
            <div
              style={{
                background: "#f7ecd9",
                border: "1px solid #e9d2a3",
                color: "#7a5a17",
                borderRadius: "var(--radius-sm)",
                padding: "12px 14px",
                fontSize: 13.5,
                marginBottom: 16,
              }}
            >
              ⚠️ Assinatura digital simulada — sem validade jurídica, aguardando a contratação do certificado A3 em
              nuvem (ICP-Brasil).
            </div>
          )}

          {c.revoked_at && (
            <div
              style={{
                background: "#fbe2e2",
                border: "1px solid #e6b3b3",
                color: "#8a2c2c",
                borderRadius: "var(--radius-sm)",
                padding: "12px 14px",
                fontSize: 13.5,
                marginBottom: 16,
                fontWeight: 600,
              }}
            >
              ❌ Documento revogado em {formatBRDateTime(c.revoked_at, "medium")}
              {c.revoked_reason && ` — ${c.revoked_reason}`}
            </div>
          )}

          {detailRow("Status", c.status)}
          {c.signature_provider && detailRow("Provedor", c.signature_provider)}
          {c.signature_provider_doc_id &&
            detailRow(
              c.signature_provider === "certisign" ? "ID da assinatura (Certisign)" : "ID da assinatura (simulado)",
              c.signature_provider_doc_id
            )}
          {c.signed_at && detailRow("Assinado em", formatBRDateTime(c.signed_at, "medium"))}
          {c.signature_error && detailRow("Erro", c.signature_error)}
          {c.sha256 && detailRow("Hash SHA-256 do PDF", <code>{c.sha256}</code>)}
          {c.validation_code && detailRow("Código de validação pública", formatValidationCode(c.validation_code))}
          {c.sent_whatsapp_at && detailRow("Reenviado por WhatsApp em", formatBRDateTime(c.sent_whatsapp_at, "medium"))}

          <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
            {c.status === "assinado" && (
              <a
                href={`/api/certificates/download/${c.id}`}
                target="_blank"
                rel="noreferrer"
                className={`${styles.btn} ${styles.btnPrimary}`}
              >
                Baixar PDF
              </a>
            )}
            <CertificateActions
              clinicId={clinic.id}
              certificateId={c.id}
              status={c.status}
              hasPhone={!!c.patient_phone}
              revoked={!!c.revoked_at}
              signUrl={c.signature_sign_url}
            />
          </div>
        </div>
      </div>
    </ClinicShell>
  );
}
