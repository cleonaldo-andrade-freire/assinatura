"use client";

import { useState, useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { formatBRDateTime } from "@/lib/date";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import styles from "@/styles/shell.module.css";

export function PatientConsentTermTab({ clinicId, patientId }: { clinicId: string; patientId: string }) {
  const [loading, setLoading] = useState(true);
  const [request, setRequest] = useState<any>(null); // consent_term_signatures
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const supabase = createSupabaseBrowserClient();

  async function fetchRequest() {
    setLoading(true);
    const { data } = await supabase
      .from("consent_term_signatures")
      .select("*")
      .eq("clinic_id", clinicId)
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
      
    setRequest(data);
    setLoading(false);
  }

  useEffect(() => {
    fetchRequest();
  }, [clinicId, patientId]);

  async function handleSend() {
    setConfirmOpen(false);
    setSending(true);
    setError("");
    
    try {
      const res = await fetch(`/api/clinics/${clinicId}/patients/${patientId}/consent-term`, {
        method: "POST"
      });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.message || data.error || "Erro ao enviar solicitação");
      }
      
      alert("Solicitação enviada com sucesso!");
      fetchRequest();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  async function handleDownloadPdf() {
    if (!request?.pdf_storage_key) return;
    // We don't have a specific GET pdf route yet, we can use the storage download URL directly.
    // Wait, storage requires auth, but the dentist is logged in.
    const { data } = await supabase.storage.from("treatment-evolutions").createSignedUrl(request.pdf_storage_key, 60 * 60);
    if (data?.signedUrl) {
      window.open(data.signedUrl, "_blank");
    } else {
      alert("Erro ao baixar PDF");
    }
  }

  if (loading) {
    return <div className={styles.emptyState}>Carregando...</div>;
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <h2 className={styles.title}>Termo de Adesão Eletrônica</h2>
        <p className={styles.subtitle} style={{ marginTop: 4 }}>
          Este documento autoriza o tratamento de dados e o uso de assinaturas eletrônicas do paciente.
        </p>
      </div>

      {error && <div className={styles.errorAlert} style={{ marginBottom: 20 }}>{error}</div>}

      {!request ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>📄</div>
          <h3>Nenhum Termo Assinado</h3>
          <p>Este paciente ainda não assinou o termo de adesão isoladamente.</p>
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => setConfirmOpen(true)} disabled={sending} style={{ marginTop: 20 }}>
            {sending ? "Enviando..." : "Solicitar Assinatura (WhatsApp)"}
          </button>
        </div>
      ) : (
        <div className={styles.card} style={{ padding: 20, border: "1px solid var(--line)", borderRadius: 8, background: "#fff" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
            <div>
              <h3 style={{ margin: "0 0 8px" }}>Termo de Adesão</h3>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span style={{
                  padding: "4px 8px", 
                  borderRadius: 4, 
                  fontSize: 12, 
                  fontWeight: 600,
                  background: request.status === "assinado" ? "var(--success-bg)" : "var(--warn-bg)",
                  color: request.status === "assinado" ? "var(--success)" : "var(--warn)",
                }}>
                  {request.status === "assinado" ? "Assinado" : "Aguardando"}
                </span>
                <span style={{ fontSize: 13, color: "var(--ink-soft)" }}>
                  Enviado em {formatBRDateTime(request.created_at)}
                </span>
              </div>
            </div>
            
            <div style={{ display: "flex", gap: 8 }}>
              {request.status === "assinado" ? (
                <button className={styles.btnSecondary} onClick={handleDownloadPdf}>
                  Ver PDF
                </button>
              ) : (
                <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => setConfirmOpen(true)} disabled={sending}>
                  Reenviar WhatsApp
                </button>
              )}
            </div>
          </div>
          
          {request.status === "assinado" && (
            <div style={{ background: "var(--bg)", padding: 15, borderRadius: 6, fontSize: 13, color: "var(--ink-soft)" }}>
              <div style={{ marginBottom: 6 }}><strong>Signatário:</strong> {request.signer_name} (CPF: {request.signer_cpf})</div>
              <div style={{ marginBottom: 6 }}><strong>Assinado em:</strong> {request.signed_at_server ? formatBRDateTime(request.signed_at_server) : "-"}</div>
              <div style={{ marginBottom: 6 }}><strong>IP:</strong> {request.ip}</div>
              <div><strong>Código Verificação:</strong> {request.verification_code}</div>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Solicitar Assinatura"
        message="Enviar solicitação de assinatura para o WhatsApp do paciente?"
        confirmLabel="Sim, enviar"
        cancelLabel="Cancelar"
        onConfirm={handleSend}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
