import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ClinicShell } from "@/components/clinic/ClinicShell";
import type { Anamnesis, Signature } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

function detailRow(label: string, value: React.ReactNode) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
      <span style={{ color: "var(--ink-soft)", fontSize: 13.5 }}>{label}</span>
      <span style={{ fontSize: 13.5, fontFamily: "inherit", textAlign: "right", wordBreak: "break-all" }}>{value}</span>
    </div>
  );
}

export default async function AnamnesisDetailPage({ params }: { params: { id: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic) redirect("/login");

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
      subtitle={`Anamnese registrada em ${new Date(typedAnamnesis.created_at).toLocaleDateString("pt-BR")}`}
      actions={
        <Link href="/dashboard" className={`${styles.btn} ${styles.btnGhost}`}>
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
              <div style={{ fontSize: 14.5 }}>{a.answer}</div>
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
                new Date(typedSignature.signed_at_client).toLocaleString("pt-BR")
              )}
              {detailRow(
                "Data/hora (servidor)",
                new Date(typedSignature.signed_at_server).toLocaleString("pt-BR")
              )}
              {detailRow("Endereço IP", typedSignature.ip ?? "não capturado")}
              {detailRow("Dispositivo/navegador", typedSignature.user_agent ?? "não capturado")}
              {detailRow("Hash SHA-256 do PDF", <code>{typedSignature.sha256}</code>)}
              <div style={{ marginTop: 16 }}>
                <a href={`/api/pdf/${typedSignature.id}`} target="_blank" rel="noreferrer" className={`${styles.btn} ${styles.btnPrimary}`}>
                  Baixar PDF assinado
                </a>
              </div>
            </>
          )}
        </div>
      </div>
    </ClinicShell>
  );
}
