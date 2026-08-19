"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatBRPhoneLocal, formatCPF, isValidCPF, toE164BR } from "@/lib/validation";
import { formatBRDate } from "@/lib/date";
import { resolveReasonSegments } from "@/lib/documentReason";
import { PatientSearchField, type PatientSuggestion } from "@/components/PatientSearchField";
import { AgentCertificateSelector, useAgent, type AgentCertificate } from "@/components/AgentDetector";
import type { Certificate, CertificateTemplate } from "@/lib/database.types";
import { useDraftAutosave } from "@/lib/useDraftAutosave";
import { useMobileV2Active } from "@/lib/useMobileV2Active";
import { DraftBanner } from "@/components/mobile/DraftBanner";
import styles from "@/styles/shell.module.css";

interface CidSuggestion {
  code: string;
  description: string;
}

function todayISO(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function NewCertificateForm({
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
  templates: CertificateTemplate[];
  /** Pré-preenche o paciente (ex.: botão "Novo atestado" na ficha do paciente) — pula a busca. */
  initialPatientId?: string | null;
  initialPatientName?: string;
  initialPatientCpf?: string | null;
  initialPatientPhone?: string | null;
  /** Sem o cartão (`.panel`) ao redor — pro caso de já estar dentro de um modal. */
  bare?: boolean;
  /** Usado quando o formulário roda dentro de um modal — devolve o atestado criado em vez de navegar. */
  onSuccess?: (certificate: Certificate) => void;
}) {
  const router = useRouter();

  const [patientId, setPatientId] = useState<string | null>(initialPatientId ?? null);
  const [patientName, setPatientName] = useState(initialPatientName ?? "");

  const [cid, setCid] = useState("");
  const [cidSuggestions, setCidSuggestions] = useState<CidSuggestion[]>([]);
  const [showCidSuggestions, setShowCidSuggestions] = useState(false);
  const [hideCid, setHideCid] = useState(false);
  const [reason, setReason] = useState("");
  const [restDays, setRestDays] = useState(1);
  const [startsOn, setStartsOn] = useState(todayISO());
  const [templateId, setTemplateId] = useState("");

  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cidDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { isAgentRunning, signHash } = useAgent();
  const [showAgentSelector, setShowAgentSelector] = useState(false);
  // Identifica se o frontend deve usar o agente local (baseado numa flag estática ou se o agente estiver rodando)
  const isLocalAgentMode = process.env.NEXT_PUBLIC_SIGNATURE_PROVIDER === "local_agent";

  // Rascunho automático (prompt mobile §7.7) — só ativo na versão mobile v2
  // (ver useMobileV2Active), pra não mudar nada do comportamento do modal no
  // desktop. Chave por clínica+tipo+paciente, como pedido no prompt.
  const mobileV2 = useMobileV2Active();
  const draftKey = mobileV2 ? `mobiledraft:certificate:${clinicId}:${initialPatientId ?? "new"}` : null;
  const { hasDraft, draft, clearDraft, dismissDraftPrompt } = useDraftAutosave(
    draftKey,
    { patientId, patientName, cid, hideCid, reason, restDays, startsOn, templateId },
    { isEmpty: (v) => !v.patientName.trim() && !v.reason.trim() && !v.cid.trim() }
  );

  function restoreDraft() {
    if (!draft) return;
    setPatientId(draft.patientId);
    setPatientName(draft.patientName);
    setCid(draft.cid);
    setHideCid(draft.hideCid);
    setReason(draft.reason);
    setRestDays(draft.restDays);
    setStartsOn(draft.startsOn);
    setTemplateId(draft.templateId);
    dismissDraftPrompt();
  }

  useEffect(() => {
    if (cidDebounceRef.current) clearTimeout(cidDebounceRef.current);
    if (cid.trim().length < 2) {
      setCidSuggestions([]);
      return;
    }
    cidDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/cid-codes/search?q=${encodeURIComponent(cid.trim())}`);
        if (!res.ok) return;
        const data = await res.json();
        setCidSuggestions(data.codes ?? []);
      } catch {
        // idem — autocomplete de CID é conveniência, não bloqueia o texto livre
      }
    }, 300);
    return () => {
      if (cidDebounceRef.current) clearTimeout(cidDebounceRef.current);
    };
  }, [cid]);

  function pickPatientSuggestion(s: PatientSuggestion) {
    setPatientId(s.id);
    setPatientName(s.name);
  }

  function handleSelectTemplate(id: string) {
    setTemplateId(id);
    const template = templates.find((t) => t.id === id);
    if (!template) return;
    // Carrega o texto do modelo com os placeholders intactos (`{{paciente_nome}}`
    // etc.) — a substituição pelos dados reais só acontece na prévia abaixo e no
    // PDF final, nunca aqui. Assim o texto nunca "engessa" com um nome/CPF que
    // ainda não tinha sido digitado no momento da seleção.
    setReason(template.reason_template);
    if (template.rest_days_default != null) setRestDays(template.rest_days_default);
  }

  function goToCreated(certificate: Certificate) {
    clearDraft();
    if (onSuccess) {
      onSuccess(certificate);
      router.refresh();
    } else {
      router.push(`/dashboard/atestados/${certificate.id}`);
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

    if (isLocalAgentMode) {
      setShowAgentSelector(true);
      return;
    }

    await emitCertificate(null);
  }

  async function emitCertificate(cert: AgentCertificate | null) {
    setSending(true);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/certificates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_name: patientName.trim(),
          patient_id: patientId ?? undefined,
          cid: cid.trim() || undefined,
          hide_cid_on_patient_pdf: hideCid,
          reason: reason.trim(),
          rest_days: restDays,
          starts_on: startsOn,
          signerCertificatePem: cert 
            ? cert.certificateChainBase64.map(b64 => `-----BEGIN CERTIFICATE-----\n${b64.match(/.{1,64}/g)?.join('\n') || b64}\n-----END CERTIFICATE-----`).join('\n') 
            : undefined
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || "Falha ao emitir o atestado.");
      }

      let finalCert = data.certificate;

      // Se o backend retornou _externalSigning, finaliza a assinatura local
      if (finalCert._externalSigning && cert) {
        const sigBase64 = await signHash(cert.thumbprint, finalCert._externalSigning.hashToSignBase64);
        const finishRes = await fetch(`/api/clinics/${clinicId}/certificates/${finalCert.id}/sign-local/finish`, {
           method: "POST",
           headers: { "Content-Type": "application/json" },
           body: JSON.stringify({
             signatureSessionId: finalCert._externalSigning.signatureSessionId,
             signatureBase64: sigBase64
           })
        });
        const finishData = await finishRes.json();
        if (!finishRes.ok) throw new Error(finishData.message || finishData.error || "Falha ao finalizar assinatura.");
        finalCert = finishData.certificate;
      }

      goToCreated(finalCert as Certificate);
    } catch (err: any) {
      setError(err.message || "Erro desconhecido ao assinar.");
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
    <button className={`${styles.btn} ${styles.btnPrimary}`} type="submit" disabled={sending}>
      {sending ? "Emitindo…" : "Emitir atestado"}
    </button>
  );

  const fieldGroups = (
    <>
      {templates.length > 0 && (
        <div className={styles.field}>
          <label htmlFor="templateId" className={styles.label}>
            Modelo de atestado (opcional)
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
        hint={bare ? undefined : "Busca no cadastro de pacientes da clínica — se não encontrar, um cadastro novo é criado automaticamente ao emitir o atestado."}
      />

      <div className={styles.formRow}>
        <div className={styles.field}>
          <label htmlFor="startsOn" className={styles.label}>
            Início do afastamento
          </label>
          <input id="startsOn" type="date" className={styles.input} value={startsOn} onChange={(e) => setStartsOn(e.target.value)} required />
        </div>
        <div className={styles.field}>
          <label htmlFor="restDays" className={styles.label}>
            Dias de afastamento
          </label>
          <input
            id="restDays"
            type="number"
            min={0}
            className={styles.input}
            value={restDays}
            onChange={(e) => setRestDays(Math.max(0, parseInt(e.target.value, 10) || 0))}
            required
          />
        </div>
      </div>

      <div className={styles.field} style={{ position: "relative" }}>
        <label htmlFor="cid" className={styles.label}>
          CID (opcional)
        </label>
        <input
          id="cid"
          type="text"
          className={styles.input}
          value={cid}
          onChange={(e) => {
            setCid(e.target.value);
            setShowCidSuggestions(true);
          }}
          onFocus={() => setShowCidSuggestions(true)}
          onBlur={() => setTimeout(() => setShowCidSuggestions(false), 150)}
          autoComplete="off"
          placeholder="Ex.: K02.9 ou busque pela descrição"
        />
        {showCidSuggestions && cidSuggestions.length > 0 && (
          <ul
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              right: 0,
              zIndex: 5,
              margin: "4px 0 0",
              padding: 4,
              listStyle: "none",
              background: "var(--surface)",
              border: "1.5px solid var(--line)",
              borderRadius: "var(--radius-sm)",
              boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
              maxHeight: 220,
              overflowY: "auto",
            }}
          >
            {cidSuggestions.map((s) => (
              <li key={s.code}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setCid(s.code);
                    setShowCidSuggestions(false);
                    setCidSuggestions([]);
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "8px 10px",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    borderRadius: 6,
                    fontSize: 13.5,
                  }}
                >
                  <strong>{s.code}</strong> — {s.description}
                </button>
              </li>
            ))}
          </ul>
        )}
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 13.5 }}>
          <input type="checkbox" checked={hideCid} onChange={(e) => setHideCid(e.target.checked)} />
          Ocultar CID no atestado do paciente (Lei nº 9.436/97) — fica salvo só no registro
        </label>
      </div>

      <div className={styles.field}>
        <label htmlFor="reason" className={styles.label}>
          Texto do atestado
        </label>
        <textarea
          id="reason"
          className={styles.input}
          rows={bare ? 3 : 4}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Atesto, para os devidos fins, que o(a) paciente esteve sob meus cuidados odontológicos…"
          required
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
        emitCertificate(cert);
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
