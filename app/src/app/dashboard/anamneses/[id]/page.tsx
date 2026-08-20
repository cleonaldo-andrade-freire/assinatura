import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getClinicAndRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ClinicShell } from "@/components/clinic/ClinicShell";
import { AnamnesisActions } from "@/components/AnamnesisActions";
import { formatBRDate, formatBRDateTime } from "@/lib/date";
import type { Anamnesis, Signature } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

/** Sim = verde, Não = vermelho — só quando a resposta começa exatamente
 * assim (ex.: "Sim Obs: ..."); respostas livres ("Nenhuma dor") ficam com a
 * cor padrão. */
function answerColor(answer: string): string | undefined {
  const trimmed = answer.trim();
  if (/^sim\b/i.test(trimmed)) return "var(--brand)";
  if (/^não\b/i.test(trimmed)) return "var(--danger)";
  return undefined;
}

function detailRow(label: string, value: React.ReactNode) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
      <span style={{ color: "var(--ink-soft)", fontSize: 13.5 }}>{label}</span>
      <span style={{ fontSize: 13.5, fontFamily: "inherit", textAlign: "right", wordBreak: "break-all" }}>{value}</span>
    </div>
  );
}

export default async function AnamnesisDetailPage({ params }: { params: { id: string } }) {
  const auth = await getClinicAndRole();
  if (!auth) redirect("/login");
  if (auth.role !== "owner") redirect("/dashboard");
  const { clinic, role, userEmail, userName, userAvatarUrl } = auth;

  const supabase = await createSupabaseServerClient();
  const { data: anamnesis } = await supabase
    .from("anamneses")
    .select("*")
    .eq("id", params.id)
    .eq("clinic_id", clinic.id)
    .maybeSingle();
  if (!anamnesis) notFound();
  const typedAnamnesis = anamnesis as Anamnesis;

  const { data: signature } = await supabase
    .from("signatures")
    .select("*")
    .eq("anamnesis_id", typedAnamnesis.id)
    .maybeSingle();
  const typedSignature = signature as Signature | null;

  return (
    <ClinicShell
      clinicName={clinic.name}
      clinicLogoUrl={clinic.logo_url}
      title={typedAnamnesis.patient_name}
      subtitle={`Anamnese registrada em ${formatBRDate(typedAnamnesis.created_at)}`}
      role={role}
      userEmail={userEmail}
      userName={userName}
      userAvatarUrl={userAvatarUrl}
      actions={
        <Link href="/dashboard/anamneses" className={`${styles.btn} ${styles.btnGhost}`}>
          ← Voltar
        </Link>
      }
    >
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <p className={styles.panelHeaderTitle}>Respostas da anamnese</p>
        </div>
        <div className={styles.panelBody}>
          {typedAnamnesis.answers.map((a, i) => (
            <div key={i} style={{ padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
              <div style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 2 }}>{a.question}</div>
              <div style={{ fontSize: 14.5, fontWeight: 700, color: answerColor(a.answer) }}>{a.answer}</div>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <p className={styles.panelHeaderTitle}>Trilha de auditoria da assinatura</p>
        </div>
        <div className={styles.panelBody}>
          {!typedSignature ? (
            <p style={{ color: "var(--ink-soft)", fontSize: 14, margin: 0 }}>
              Essa anamnese ainda não foi assinada.{" "}
              <a href={`/assinatura?token=${typedAnamnesis.token}`} target="_blank" rel="noreferrer">
                Ver link de assinatura
              </a>
            </p>
          ) : (
            <>
              <p style={{ color: "var(--ink-soft)", fontSize: 13.5, margin: "0 0 12px" }}>
                Evidência jurídica da assinatura eletrônica (MP 2.200-2/2001, Lei 14.063/2020) — guardada
                integralmente, sem edição possível pelo sistema.
              </p>
              {detailRow("Assinado por", `${typedSignature.signer_name} (CPF ${typedSignature.signer_cpf})`)}
              {detailRow(
                "Data/hora (dispositivo do paciente)",
                formatBRDateTime(typedSignature.signed_at_client, "medium")
              )}
              {detailRow(
                "Data/hora (servidor)",
                formatBRDateTime(typedSignature.signed_at_server, "medium")
              )}
              {detailRow("Endereço IP", typedSignature.ip ?? "não capturado")}
              {detailRow("Dispositivo/navegador", typedSignature.user_agent ?? "não capturado")}
              {detailRow("Hash SHA-256 do PDF", <code>{typedSignature.sha256}</code>)}
            </>
          )}
          <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
            {typedSignature && (
              <a
                href={`/api/pdf/${typedSignature.id}`}
                target="_blank"
                rel="noreferrer"
                className={styles.iconActionBtn}
                title="Baixar PDF assinado"
                aria-label="Baixar PDF assinado"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 3v12m0 0l-4.5-4.5M12 15l4.5-4.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M4 18v1.5A1.5 1.5 0 005.5 21h13a1.5 1.5 0 001.5-1.5V18" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                </svg>
              </a>
            )}
            <AnamnesisActions
              clinicId={clinic.id}
              anamnesisId={typedAnamnesis.id}
              hasPatientSignature={!!typedSignature}
              dentistSignatureStatus={typedSignature?.dentist_signature_status ?? "nao_assinada"}
            />
          </div>
        </div>
      </div>

      {typedSignature?.dentist_signature_status === "assinada" && (
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <p className={styles.panelHeaderTitle}>Assinatura do dentista</p>
          </div>
          <div className={styles.panelBody}>
            <p style={{ color: "var(--ink-soft)", fontSize: 13.5, margin: "0 0 12px" }}>
              Contra-assinatura ICP-Brasil confirmando ciência do conteúdo declarado pelo paciente.
            </p>
            {detailRow("Data/hora", formatBRDateTime(typedSignature.dentist_signed_at!, "medium"))}
            {detailRow("Hash SHA-256 do PDF", <code>{typedSignature.dentist_pdf_sha256}</code>)}
            <div style={{ marginTop: 16 }}>
              <a
                href={`/api/pdf/${typedSignature.id}/dentista`}
                target="_blank"
                rel="noreferrer"
                className={styles.iconActionBtn}
                title="Baixar PDF assinado pela dentista"
                aria-label="Baixar PDF assinado pela dentista"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 3v12m0 0l-4.5-4.5M12 15l4.5-4.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M4 18v1.5A1.5 1.5 0 005.5 21h13a1.5 1.5 0 001.5-1.5V18" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      )}
    </ClinicShell>
  );
}
