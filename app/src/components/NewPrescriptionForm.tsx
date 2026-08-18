"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatBRPhoneLocal, formatCPF, isValidCPF, toE164BR } from "@/lib/validation";
import { formatBRDate } from "@/lib/date";
import { resolveReasonSegments } from "@/lib/documentReason";
import { PrescriptionItemsEditor } from "@/components/PrescriptionItemsEditor";
import { PatientSearchField, type PatientSuggestion } from "@/components/PatientSearchField";
import { AgentCertificateSelector, useAgent, type AgentCertificate } from "@/components/AgentDetector";
import type { Prescription, PrescriptionItem, PrescriptionTemplate } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

const ERROR_MESSAGES: Record<string, string> = {
  controlado_especial_nao_suportado:
    "Tem item marcado como controlado especial — este sistema não emite esse tipo de prescrição.",
  dentist_not_configured: "Cadastre o responsável técnico em Configurações antes de emitir.",
};

export function NewPrescriptionForm({
  clinicId,
  templates,
  initialPatientId,
  initialPatientName,
  initialPatientCpf,
  initialPatientPhone,
  bare,
  onSuccess,
}: {
  clinicId: string;
  templates: PrescriptionTemplate[];
  /** Pré-preenche o paciente (ex.: botão "Nova prescrição" na ficha do paciente) — pula a busca. */
  initialPatientId?: string | null;
  initialPatientName?: string;
  initialPatientCpf?: string | null;
  initialPatientPhone?: string | null;
  /** Sem o cartão (`.panel`) ao redor — pro caso de já estar dentro de um modal. */
  bare?: boolean;
  /** Usado quando o formulário roda dentro de um modal — devolve a prescrição criada em vez de navegar. */
  onSuccess?: (prescription: Prescription) => void;
}) {
  const router = useRouter();

  const [patientId, setPatientId] = useState<string | null>(initialPatientId ?? null);
  const [patientName, setPatientName] = useState(initialPatientName ?? "");
  const [patientCpf, setPatientCpf] = useState(initialPatientCpf ? formatCPF(initialPatientCpf) : "");
  const [patientPhone, setPatientPhone] = useState(initialPatientPhone ? formatBRPhoneLocal(initialPatientPhone) : "");

  const [items, setItems] = useState<PrescriptionItem[]>([
    { drug_name: "", dosage: "", instructions: "", generic_allowed: false, control_type: "comum" },
  ]);
  const [notes, setNotes] = useState("");
  const [templateId, setTemplateId] = useState("");

  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cpfError = patientCpf.trim() && !isValidCPF(patientCpf) ? "CPF inválido." : null;

  const { signHash } = useAgent();
  const [showAgentSelector, setShowAgentSelector] = useState(false);
  const isLocalAgentMode = process.env.NEXT_PUBLIC_SIGNATURE_PROVIDER === "local_agent";

  function pickPatientSuggestion(s: PatientSuggestion) {
    setPatientId(s.id);
    setPatientName(s.name);
    setPatientCpf(s.cpf ? formatCPF(s.cpf) : "");
    setPatientPhone(s.phone ? formatBRPhoneLocal(s.phone) : "");
  }

  function handleSelectTemplate(id: string) {
    setTemplateId(id);
    const template = templates.find((t) => t.id === id);
    if (!template) return;
    // Carrega os itens e o texto do modelo com os placeholders intactos — a
    // substituição pelos dados reais só acontece na prévia abaixo e no PDF
    // final, mesma correção que já vale pro atestado.
    if (template.items.length > 0) {
      setItems(template.items.map((i) => ({ ...i })));
    }
    setNotes(template.notes_template ?? "");
  }

  const notesPreview = notes.includes("{{")
    ? resolveReasonSegments(notes, {
        paciente_nome: patientName.trim(),
        paciente_cpf: patientCpf.trim(),
        data_emissao: formatBRDate(new Date().toISOString()),
      })
    : null;

  function goToCreated(prescription: Prescription) {
    if (onSuccess) {
      onSuccess(prescription);
      router.refresh();
    } else {
      router.push(`/dashboard/prescricoes/${prescription.id}`);
      router.refresh();
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (cpfError) {
      setError(cpfError);
      return;
    }
    if (items.some((i) => i.control_type === "controlado_especial")) {
      setError(
        "Tem item marcado como controlado especial — este sistema não emite esse tipo de prescrição. Troque o tipo de controle ou remova o item."
      );
      return;
    }

    if (isLocalAgentMode) {
      setShowAgentSelector(true);
      return;
    }

    await emitPrescription(null);
  }

  async function emitPrescription(cert: AgentCertificate | null) {
    setSending(true);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/prescriptions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_name: patientName.trim(),
          patient_cpf: patientCpf.trim() || undefined,
          patient_phone: patientPhone.trim() ? toE164BR(patientPhone) : undefined,
          patient_id: patientId ?? undefined,
          items: items
            .filter((i) => i.drug_name.trim())
            .map((i) => ({ ...i, dosage: i.dosage.trim(), instructions: i.instructions.trim() })),
          notes: notes.trim() || undefined,
          signerCertificatePem: cert
            ? cert.certificateChainBase64.map((b64) => `-----BEGIN CERTIFICATE-----\n${b64.match(/.{1,64}/g)?.join("\n") || b64}\n-----END CERTIFICATE-----`).join("\n")
            : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || ERROR_MESSAGES[data.error] || "Falha ao emitir a prescrição.");
        return;
      }

      let finalPrescription = data.prescription;

      // Se o backend retornou _externalSigning, finaliza a assinatura local
      if (finalPrescription._externalSigning && cert) {
        const sigBase64 = await signHash(cert.thumbprint, finalPrescription._externalSigning.hashToSignBase64);
        const finishRes = await fetch(`/api/clinics/${clinicId}/prescriptions/${finalPrescription.id}/sign-local/finish`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            signatureSessionId: finalPrescription._externalSigning.signatureSessionId,
            signatureBase64: sigBase64,
          }),
        });
        const finishData = await finishRes.json();
        if (!finishRes.ok) {
          setError(finishData.message || finishData.error || "Falha ao finalizar assinatura.");
          return;
        }
        finalPrescription = finishData.prescription;
      }

      goToCreated(finalPrescription as Prescription);
    } finally {
      setSending(false);
      setShowAgentSelector(false);
    }
  }

  const alerts = <>{error && <div className="error-box">{error}</div>}</>;

  const submitButton = (
    <button className={`${styles.btn} ${styles.btnPrimary}`} type="submit" disabled={sending || !!cpfError}>
      {sending ? "Emitindo…" : "Emitir prescrição"}
    </button>
  );

  const fieldGroups = (
    <>
      {templates.length > 0 && (
        <div className={styles.field}>
          <label htmlFor="templateId" className={styles.label}>
            Modelo de prescrição (opcional)
          </label>
          <select id="templateId" className={styles.select} value={templateId} onChange={(e) => handleSelectTemplate(e.target.value)}>
            <option value="">Escrever do zero</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <PatientSearchField
        clinicId={clinicId}
        name={patientName}
        onChangeName={(n) => {
          setPatientName(n);
          setPatientId(null);
        }}
        onSelect={pickPatientSuggestion}
        hint={bare ? undefined : "Busca no cadastro de pacientes da clínica — se não encontrar, um cadastro novo é criado automaticamente ao emitir a prescrição."}
      />

      <div className={styles.formRow}>
        <div className={styles.field}>
          <label htmlFor="patientCpf" className={styles.label}>
            CPF (opcional)
          </label>
          <input
            id="patientCpf"
            type="text"
            inputMode="numeric"
            className={styles.input}
            value={patientCpf}
            onChange={(e) => setPatientCpf(formatCPF(e.target.value))}
            placeholder="000.000.000-00"
            maxLength={14}
          />
          {cpfError && <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 5 }}>{cpfError}</div>}
        </div>
        <div className={styles.field}>
          <label htmlFor="patientPhone" className={styles.label}>
            WhatsApp (opcional)
          </label>
          <input
            id="patientPhone"
            type="text"
            inputMode="numeric"
            className={styles.input}
            value={patientPhone}
            onChange={(e) => setPatientPhone(formatBRPhoneLocal(e.target.value))}
            placeholder="(79) 99999-9999"
          />
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Medicamentos</label>
        <PrescriptionItemsEditor items={items} onChange={setItems} />
      </div>

      <div className={styles.field}>
        <label htmlFor="notes" className={styles.label}>
          Orientações gerais (opcional)
        </label>
        <textarea
          id="notes"
          className={styles.input}
          rows={bare ? 2 : 3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Ex.: retornar em caso de reação adversa…"
        />
        <p className={styles.hint}>
          Pode usar <code>{"{{paciente_nome}}"}</code>, <code>{"{{paciente_cpf}}"}</code> e <code>{"{{data_emissao}}"}</code> — esses trechos saem
          em <strong>negrito</strong> no PDF final.
        </p>
        {notesPreview && (
          <div style={{ marginTop: 10, padding: "10px 12px", background: "var(--surface-sunken)", borderRadius: "var(--radius-sm)", fontSize: 13.5 }}>
            <p style={{ margin: "0 0 6px", fontSize: 11.5, fontWeight: 700, color: "var(--ink-soft)", textTransform: "uppercase" }}>Prévia</p>
            {notesPreview.map((seg, i) => (seg.variable ? <strong key={i}>{seg.text}</strong> : <span key={i}>{seg.text}</span>))}
          </div>
        )}
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

      <AgentCertificateSelector
        open={showAgentSelector}
        onOpenChange={setShowAgentSelector}
        onCertificateSelected={(cert) => {
          setShowAgentSelector(false);
          emitPrescription(cert);
        }}
      />
    </div>
  );
}
