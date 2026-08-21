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
import { useDraftAutosave } from "@/lib/useDraftAutosave";
import { useMobileV2Active } from "@/lib/useMobileV2Active";
import { DraftBanner } from "@/components/mobile/DraftBanner";
import styles from "@/styles/shell.module.css";

const ERROR_MESSAGES: Record<string, string> = {
  controlado_especial_nao_suportado:
    "Tem item marcado como controlado especial — este sistema não emite esse tipo de receituário.",
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
  /** Pré-preenche o paciente (ex.: botão "Novo receituário" na ficha do paciente) — pula a busca. */
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

  const [items, setItems] = useState<PrescriptionItem[]>([]);
  const [notes, setNotes] = useState("");
  const [templateId, setTemplateId] = useState("");

  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateSaved, setTemplateSaved] = useState(false);

  const { signHash } = useAgent();
  const [showAgentSelector, setShowAgentSelector] = useState(false);
  const isLocalAgentMode = process.env.NEXT_PUBLIC_SIGNATURE_PROVIDER === "local_agent";

  // Rascunho automático (prompt mobile §7.7) — ver NewCertificateForm.tsx
  // pra explicação completa; mesmo padrão aqui.
  const mobileV2 = useMobileV2Active();
  const draftKey = mobileV2 ? `mobiledraft:prescription:${clinicId}:${initialPatientId ?? "new"}` : null;
  const { hasDraft, draft, clearDraft, dismissDraftPrompt } = useDraftAutosave(
    draftKey,
    { patientId, patientName, items, notes, templateId },
    { isEmpty: (v) => !v.patientName.trim() && v.items.length === 0 && !v.notes.trim() }
  );

  function restoreDraft() {
    if (!draft) return;
    setPatientId(draft.patientId);
    setPatientName(draft.patientName);
    setItems(draft.items);
    setNotes(draft.notes);
    setTemplateId(draft.templateId);
    dismissDraftPrompt();
  }

  function pickPatientSuggestion(s: PatientSuggestion) {
    setPatientId(s.id);
    setPatientName(s.name);
  }

  function handleSelectTemplate(id: string) {
    setTemplateId(id);
    setTemplateSaved(false);
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

  /** Atualiza o modelo selecionado com os itens/orientações atuais da tela —
   * pedido explícito: escolher um modelo com 1 medicamento, adicionar mais 1
   * e poder atualizar o modelo sem sair pra tela de modelos separada. */
  async function handleUpdateTemplate() {
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;
    setSavingTemplate(true);
    setTemplateSaved(false);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/prescription-templates/${templateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: template.name,
          items: items
            .filter((i) => i.drug_name.trim())
            .map((i) => ({ ...i, dosage: i.dosage.trim(), instructions: i.instructions.trim() })),
          notes_template: notes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.message || "Falha ao atualizar o modelo.");
        return;
      }
      setTemplateSaved(true);
      router.refresh();
    } finally {
      setSavingTemplate(false);
    }
  }

  function goToCreated(prescription: Prescription) {
    clearDraft();
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
    if (!patientName.trim()) {
      setError("Preencha o nome do paciente.");
      return;
    }
    if (items.some((i) => i.control_type === "controlado_especial")) {
      setError(
        "Tem item marcado como controlado especial — este sistema não emite esse tipo de receituário. Troque o tipo de controle ou remova o item."
      );
      return;
    }

    // Nesta versão o celular nunca assina digitalmente (prompt §2, §8) —
    // não importa o provedor configurado. local_agent em especial *nunca*
    // funcionaria no celular (é um aplicativo Windows do computador da
    // dentista) — abrir o AgentCertificateSelector aqui ficaria esperando
    // um agente que não existe no telefone. Sai em pendente_assinatura,
    // assinável de verdade depois no computador.
    if (mobileV2) {
      await emitPrescription(null, true);
      return;
    }

    if (isLocalAgentMode) {
      setShowAgentSelector(true);
      return;
    }

    await emitPrescription(null);
  }

  async function emitPrescription(cert: AgentCertificate | null, unsigned?: boolean) {
    setSending(true);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/prescriptions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_name: patientName.trim(),
          patient_id: patientId ?? undefined,
          items: items
            .filter((i) => i.drug_name.trim())
            .map((i) => ({ ...i, dosage: i.dosage.trim(), instructions: i.instructions.trim() })),
          notes: notes.trim() || undefined,
          unsigned: unsigned || undefined,
          signerCertificatePem: cert
            ? cert.certificateChainBase64.map((b64) => `-----BEGIN CERTIFICATE-----\n${b64.match(/.{1,64}/g)?.join("\n") || b64}\n-----END CERTIFICATE-----`).join("\n")
            : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || ERROR_MESSAGES[data.error] || "Falha ao emitir o receituário.");
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

  const alerts = (
    <>
      {mobileV2 && hasDraft && <DraftBanner onRestore={restoreDraft} onDiscard={clearDraft} />}
      {error && <div className="error-box">{error}</div>}
    </>
  );

  const submitButton = (
    <>
      <button
        className={`${styles.btn} ${styles.btnPrimary}`}
        type="submit"
        disabled={sending}
        title={mobileV2 ? "Gera o PDF sem assinatura ICP-Brasil, pra imprimir e assinar à mão. Pode ser assinado digitalmente depois, no computador." : undefined}
      >
        {sending ? "Emitindo…" : mobileV2 ? "Emitir receituário (sem assinatura digital)" : "Emitir receituário"}
      </button>
      {mobileV2 && (
        <p className={styles.hint} style={{ marginTop: 8 }}>
          O celular não assina digitalmente. Este receituário sai pronto pra imprimir, com espaço pra assinatura e
          carimbo — a versão assinada digitalmente pode ser gerada depois, no computador, sobre o mesmo registro.
        </p>
      )}
    </>
  );

  const fieldGroups = (
    <>
      {templates.length > 0 && (
        <div className={styles.field}>
          <label htmlFor="templateId" className={styles.label}>
            Modelo de receituário (opcional)
          </label>
          <select id="templateId" className={styles.select} value={templateId} onChange={(e) => handleSelectTemplate(e.target.value)}>
            <option value="">Escrever do zero</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          {templateId && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
              <button
                type="button"
                onClick={handleUpdateTemplate}
                disabled={savingTemplate}
                className={`${styles.btn} ${styles.btnGhost}`}
                style={{ padding: "5px 10px", fontSize: 12.5 }}
              >
                {savingTemplate ? "Atualizando…" : "↻ Atualizar modelo com os itens atuais"}
              </button>
              {templateSaved && <span style={{ fontSize: 12.5, color: "var(--brand)" }}>Modelo atualizado ✓</span>}
            </div>
          )}
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
        hint={bare ? undefined : "Busca no cadastro de pacientes da clínica — se não encontrar, um cadastro novo é criado automaticamente ao emitir o receituário."}
      />

      <div className={styles.field}>
        <label className={styles.label}>Medicamentos</label>
        <PrescriptionItemsEditor
          items={items}
          onChange={(next) => {
            setItems(next);
            setTemplateSaved(false);
          }}
        />
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
          onChange={(e) => {
            setNotes(e.target.value);
            setTemplateSaved(false);
          }}
          placeholder="Ex.: retornar em caso de reação adversa…"
        />
      </div>
    </>
  );

  const agentSelector = (
    <AgentCertificateSelector
      open={showAgentSelector}
      onOpenChange={setShowAgentSelector}
      onCertificateSelected={(cert) => {
        setShowAgentSelector(false);
        emitPrescription(cert);
      }}
    />
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
        {agentSelector}
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
      {agentSelector}
    </div>
  );
}
