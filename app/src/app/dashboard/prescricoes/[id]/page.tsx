import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ClinicShell } from "@/components/clinic/ClinicShell";
import { PrescriptionActions } from "@/components/PrescriptionActions";
import { formatBRDate, formatBRDateTime } from "@/lib/date";
import { formatBRPhoneLocal } from "@/lib/validation";
import { resolveReasonSegments } from "@/lib/documentReason";
import { formatValidationCode } from "@/lib/validationCode";
import { PRESCRIPTION_CONTROL_LABEL } from "@/lib/prescriptionControl";
import type { Prescription } from "@/lib/database.types";
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

export default async function PrescriptionDetailPage({ params }: { params: { id: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic) redirect("/login");

  const supabase = await createSupabaseServerClient();
  const { data: prescription } = await supabase
    .from("prescriptions")
    .select("*")
    .eq("id", params.id)
    .eq("clinic_id", clinic.id)
    .maybeSingle();
  if (!prescription) notFound();
  const p = prescription as Prescription;
  const notesSegments = p.notes
    ? resolveReasonSegments(p.notes, {
        paciente_nome: p.patient_name,
        paciente_cpf: p.patient_cpf ?? "",
        data_emissao: formatBRDate(p.created_at),
      })
    : null;

  return (
    <ClinicShell
      clinicName={clinic.name}
      clinicLogoUrl={clinic.logo_url}
      title={p.patient_name}
      subtitle={`Prescrição emitida em ${formatBRDate(p.created_at)}`}
      actions={
        <Link href="/dashboard/prescricoes" className={`${styles.btn} ${styles.btnGhost}`}>
          ← Voltar
        </Link>
      }
    >
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <p className={styles.panelHeaderTitle}>Dados da prescrição</p>
        </div>
        <div className={styles.panelBody}>
          {detailRow("Paciente", p.patient_name)}
          {p.patient_cpf && detailRow("CPF", p.patient_cpf)}
          {p.patient_phone && detailRow("WhatsApp", `+55 ${formatBRPhoneLocal(p.patient_phone)}`)}
          {detailRow("Dentista responsável", `${p.dentist_name} — CRO ${p.dentist_cro}/${p.dentist_cro_uf}`)}

          <div style={{ padding: "10px 0" }}>
            <span style={{ color: "var(--ink-soft)", fontSize: 13.5, display: "block", marginBottom: 8 }}>
              Medicamentos
            </span>
            {p.items.map((item, i) => (
              <div key={i} style={{ padding: "8px 0", borderBottom: i < p.items.length - 1 ? "1px solid var(--line)" : "none" }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  {i + 1}. {item.drug_name}
                </div>
                <div style={{ fontSize: 13.5, color: "var(--ink-soft)" }}>
                  {item.dosage} — {item.instructions}
                  {item.generic_allowed && " · aceita genérico"}
                </div>
                {item.control_type !== "comum" && (
                  <div
                    style={{
                      fontSize: 12.5,
                      fontWeight: 600,
                      marginTop: 4,
                      color: item.control_type === "antimicrobiano_retencao" ? "#7a5a17" : "var(--danger)",
                    }}
                  >
                    {item.control_type === "antimicrobiano_retencao" ? "⚠️ " : ""}
                    {PRESCRIPTION_CONTROL_LABEL[item.control_type]}
                  </div>
                )}
                {item.dispensed_at && (
                  <div style={{ fontSize: 12.5, color: "var(--brand)", fontWeight: 600, marginTop: 4 }}>
                    ✅ Dispensado em {formatBRDateTime(item.dispensed_at, "medium")} — CRF {item.dispensed_by_crf},
                    farmácia CNPJ {item.dispensed_by_pharmacy_cnpj}
                  </div>
                )}
              </div>
            ))}
          </div>

          {notesSegments && (
            <div style={{ padding: "10px 0" }}>
              <span style={{ color: "var(--ink-soft)", fontSize: 13.5, display: "block", marginBottom: 4 }}>
                Orientações gerais
              </span>
              <span style={{ fontSize: 14 }}>
                {notesSegments.map((seg, i) =>
                  seg.variable ? <strong key={i}>{seg.text}</strong> : <span key={i}>{seg.text}</span>
                )}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <p className={styles.panelHeaderTitle}>Assinatura</p>
        </div>
        <div className={styles.panelBody}>
          {p.signature_provider === "certisign" ? (
            p.status === "assinado" ? (
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
            ) : p.status === "aguardando_assinatura" ? (
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
          ) : p.status === "assinado" && isRealSignatureProvider(p.signature_provider) ? (
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
              ✅ Assinado digitalmente com {signatureProviderLabel(p.signature_provider)}.
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

          {p.revoked_at && (
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
              ❌ Documento revogado em {formatBRDateTime(p.revoked_at, "medium")}
              {p.revoked_reason && ` — ${p.revoked_reason}`}
            </div>
          )}

          {detailRow("Status", p.status)}
          {p.signature_provider && detailRow("Provedor", p.signature_provider)}
          {p.signature_provider_doc_id &&
            detailRow(
              p.signature_provider === "certisign" ? "ID da assinatura (Certisign)" : "ID da assinatura (simulado)",
              p.signature_provider_doc_id
            )}
          {p.signed_at && detailRow("Assinado em", formatBRDateTime(p.signed_at, "medium"))}
          {p.signature_error && detailRow("Erro", p.signature_error)}
          {p.sha256 && detailRow("Hash SHA-256 do PDF", <code>{p.sha256}</code>)}
          {p.validation_code && detailRow("Código de validação pública", formatValidationCode(p.validation_code))}
          {p.sent_whatsapp_at && detailRow("Reenviado por WhatsApp em", formatBRDateTime(p.sent_whatsapp_at, "medium"))}

          <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
            {p.status === "assinado" && (
              <a
                href={`/api/prescriptions/download/${p.id}`}
                target="_blank"
                rel="noreferrer"
                className={`${styles.btn} ${styles.btnPrimary}`}
              >
                Baixar PDF
              </a>
            )}
            <PrescriptionActions
              clinicId={clinic.id}
              prescriptionId={p.id}
              status={p.status}
              hasPhone={!!p.patient_phone}
              revoked={!!p.revoked_at}
              signUrl={p.signature_sign_url}
            />
          </div>
        </div>
      </div>
    </ClinicShell>
  );
}
