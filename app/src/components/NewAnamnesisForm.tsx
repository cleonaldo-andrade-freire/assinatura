"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatBRPhoneLocal, toE164BR } from "@/lib/validation";
import type { QuestionTemplate } from "@/lib/database.types";
import { useDraftAutosave } from "@/lib/useDraftAutosave";
import { useMobileV2Active } from "@/lib/useMobileV2Active";
import { DraftBanner } from "@/components/mobile/DraftBanner";
import { PatientSearchField, type PatientSuggestion } from "@/components/PatientSearchField";
import styles from "@/styles/shell.module.css";

export function NewAnamnesisForm({
  clinicId,
  templates,
  initialPatientName,
  initialPatientPhone,
  bare,
  onSuccess,
}: {
  clinicId: string;
  templates: QuestionTemplate[];
  /** Pré-preenche o paciente (ex.: botão "Nova anamnese" na ficha do paciente). */
  initialPatientName?: string;
  initialPatientPhone?: string | null;
  /** Sem o cartão (`.panel`) ao redor — pro caso de já estar dentro de um modal. */
  bare?: boolean;
  /** Usado quando o formulário roda dentro de um modal — fecha o modal em vez de mostrar o aviso inline. */
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [patientName, setPatientName] = useState(initialPatientName ?? "");
  const [patientPhone, setPatientPhone] = useState(initialPatientPhone ? formatBRPhoneLocal(initialPatientPhone) : "");
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [billingBlocked, setBillingBlocked] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  // Rascunho automático (prompt mobile §7.7) — ver NewCertificateForm.tsx
  // pra explicação completa; mesmo padrão aqui.
  const mobileV2 = useMobileV2Active();
  const draftKey = mobileV2 ? `mobiledraft:anamnesis:${clinicId}:new` : null;
  const { hasDraft, draft, clearDraft, dismissDraftPrompt } = useDraftAutosave(
    draftKey,
    { patientName, patientPhone, templateId },
    { isEmpty: (v) => !v.patientName.trim() && !v.patientPhone.trim() }
  );

  function restoreDraft() {
    if (!draft) return;
    setPatientName(draft.patientName);
    setPatientPhone(draft.patientPhone);
    setTemplateId(draft.templateId);
    dismissDraftPrompt();
  }

  // Preenche nome + telefone junto — diferente de NewCertificateForm/
  // NewPrescriptionForm (que só precisam do nome pra pré-preencher, o
  // paciente é resolvido por patient_id no backend), aqui não existe
  // patient_id: a rota de anamnese sempre trabalhou só com nome+telefone
  // (histórico anterior a `patients` ter virado tabela própria), então
  // selecionar uma sugestão precisa completar o telefone aqui mesmo.
  function pickPatientSuggestion(s: PatientSuggestion) {
    setPatientName(s.name);
    if (s.phone) setPatientPhone(formatBRPhoneLocal(s.phone));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBillingBlocked(false);
    setSending(true);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/anamnesis/send-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_name: patientName,
          patient_phone: toE164BR(patientPhone),
          template_id: templateId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "trial_limit_reached" || data.error === "subscription_inactive") {
          setBillingBlocked(true);
          setError(
            data.message ||
              (data.error === "trial_limit_reached"
                ? "O período de teste cobre até 3 anamneses."
                : "Assinatura inativa.")
          );
        } else {
          setError(data.message || data.error || "Falha ao enviar o link de anamnese.");
        }
        return;
      }
      clearDraft();
      if (onSuccess) {
        onSuccess();
      } else {
        setSent(true);
        setPatientName("");
        setPatientPhone("");
      }
      router.refresh();
    } finally {
      setSending(false);
    }
  }

  const alerts = (
    <>
      {mobileV2 && hasDraft && <DraftBanner onRestore={restoreDraft} onDiscard={clearDraft} />}
      {error && (
        <div
          style={{
            background: "var(--danger-tint)",
            border: "1px solid #e9c6c6",
            color: "#7a2a2a",
            borderRadius: "var(--radius-sm)",
            padding: "12px 14px",
            fontSize: 14,
            marginBottom: 18,
          }}
        >
          {error} {billingBlocked && <a href="/dashboard/configuracoes#assinatura">Ver planos e assinar →</a>}
        </div>
      )}
      {sent && (
        <div
          style={{
            background: "var(--brand-tint)",
            color: "var(--brand-deep)",
            borderRadius: "var(--radius-sm)",
            padding: "12px 14px",
            marginBottom: 18,
            fontSize: 14,
          }}
        >
          Anamnese criada — o link do formulário já foi enviado para o WhatsApp do paciente.
        </div>
      )}
    </>
  );

  const submitButton = (
    <button className={`${styles.btn} ${styles.btnPrimary}`} type="submit" disabled={sending}>
      {sending ? "Enviando…" : "Iniciar anamnese"}
    </button>
  );

  const fieldGroups = (
    <>
      <PatientSearchField
        clinicId={clinicId}
        name={patientName}
        onChangeName={setPatientName}
        onSelect={pickPatientSuggestion}
        hint="Busca no cadastro de pacientes da clínica — selecionar preenche o WhatsApp também."
      />

      <div className={styles.field}>
        <label htmlFor="patientPhone" className={styles.label}>
          WhatsApp do paciente
        </label>
        <div style={{ display: "flex" }}>
          <span
            style={{
              display: "flex",
              alignItems: "center",
              padding: "0 12px",
              border: "1.5px solid var(--line)",
              borderRight: "none",
              borderRadius: "var(--radius-sm) 0 0 var(--radius-sm)",
              background: "var(--surface-sunken)",
              color: "var(--ink-soft)",
            }}
          >
            🇧🇷 +55
          </span>
          <input
            id="patientPhone"
            type="text"
            inputMode="numeric"
            className={styles.input}
            style={{ borderRadius: "0 var(--radius-sm) var(--radius-sm) 0" }}
            placeholder="(79) 99999-9999"
            value={patientPhone}
            onChange={(e) => setPatientPhone(formatBRPhoneLocal(e.target.value))}
            required
          />
        </div>
      </div>

      <div className={styles.field}>
        <label htmlFor="templateId" className={styles.label}>
          Modelo de anamnese
        </label>
        <select id="templateId" className={styles.select} value={templateId} onChange={(e) => setTemplateId(e.target.value)} required>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.questions.length} perguntas)
            </option>
          ))}
        </select>
      </div>
    </>
  );

  if (bare) {
    return (
      <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div style={{ flexShrink: 0 }}>{alerts}</div>
        <form onSubmit={handleSubmit} className={styles.form} style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 0 }}>
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14, paddingRight: 6, paddingBottom: 2 }}>
            {fieldGroups}
          </div>
          <div style={{ flexShrink: 0, paddingTop: 14, marginTop: 10, borderTop: "1px solid var(--line-soft)" }}>{submitButton}</div>
        </form>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <div className={styles.panelBody}>
        {alerts}
        <form onSubmit={handleSubmit} className={styles.form}>
          {fieldGroups}
          <div className={styles.formActions}>{submitButton}</div>
        </form>
      </div>
    </div>
  );
}
