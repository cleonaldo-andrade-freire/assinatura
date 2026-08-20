"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { formatCPF, isValidCPF } from "@/lib/validation";
import { formatTreatmentsLabel } from "@/lib/treatments";
import { SignatureMark } from "@/components/SignatureMark";
import { SignatureCanvas, type SignatureResult } from "@/components/SignatureCanvas";
import richTextStyles from "@/components/ui/RichTextEditor.module.css";

interface StatusResponse {
  found: boolean;
  status: "solicitada" | "assinada" | "recusada" | "expirada" | "nao_solicitada";
  clinicName: string;
  clinicLogoUrl: string | null;
  patientNameMasked: string;
  needsConsent: boolean;
}

interface Snapshot {
  clinic: { name: string; logoUrl: string | null };
  dentist: { name: string; cro: string; croUf: string };
  patient: { name: string; cpf: string | null };
  treatments: { name: string; toothRegion: string | null }[];
  evolutionDate: string;
  text: string;
}

interface DocumentResponse {
  clinicName: string;
  clinicLogoUrl: string | null;
  snapshot: Snapshot;
  contentHash: string;
  consentTermText: string | null;
  consentTermVersion: string | null;
}

type Step = "loading" | "not-found" | "terminal" | "identify" | "verifying" | "review" | "sign" | "submitting" | "success" | "refuse" | "refusing" | "refused";

function formatDateBR(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("pt-BR");
  } catch {
    return iso;
  }
}

export function EvolucaoAssinaturaClient() {
  const params = useSearchParams();
  const token = params.get("token") || "";

  const [step, setStep] = useState<Step>("loading");
  const [statusData, setStatusData] = useState<StatusResponse | null>(null);
  const [doc, setDoc] = useState<DocumentResponse | null>(null);

  const [cpf, setCpf] = useState("");
  const [cpfError, setCpfError] = useState("");

  const [scrollCompleto, setScrollCompleto] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const [signature, setSignature] = useState<SignatureResult | null>(null);
  const [signError, setSignError] = useState("");

  const [refuseReason, setRefuseReason] = useState("");
  const [verificationCode, setVerificationCode] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (!token) {
        setStep("not-found");
        return;
      }
      try {
        const res = await fetch(`/api/evolucao-assinatura/${encodeURIComponent(token)}`);
        if (!res.ok) {
          setStep("not-found");
          return;
        }
        const data = (await res.json()) as StatusResponse;
        setStatusData(data);
        setStep(data.status === "solicitada" ? "identify" : "terminal");
      } catch (err) {
        console.error("Falha ao carregar status da evolução:", err);
        setStep("not-found");
      }
    }
    load();
  }, [token]);

  function handleScroll() {
    const el = scrollAreaRef.current;
    if (!el || scrollCompleto) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 24) setScrollCompleto(true);
  }

  async function submitCpf() {
    if (!isValidCPF(cpf)) {
      setCpfError("Digite um CPF válido.");
      return;
    }
    setCpfError("");
    setStep("verifying");
    try {
      const res = await fetch(`/api/evolucao-assinatura/${encodeURIComponent(token)}/verificar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cpf }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        if (body?.error === "wrong") setCpfError("CPF não confere com o cadastro. Confira e tente de novo.");
        else if (body?.error === "blocked") setCpfError("Muitas tentativas. Tente novamente em 30 minutos.");
        else if (body?.error === "expired") setCpfError("Este link expirou. Peça à clínica para enviar um novo.");
        else setCpfError("Não foi possível verificar agora. Tente novamente.");
        setStep("identify");
        return;
      }

      const docRes = await fetch(`/api/evolucao-assinatura/${encodeURIComponent(token)}/documento`);
      if (!docRes.ok) {
        setCpfError("Não foi possível carregar o documento. Tente novamente.");
        setStep("identify");
        return;
      }
      setDoc((await docRes.json()) as DocumentResponse);
      setStep("review");
    } catch (err) {
      console.error("Falha ao verificar CPF:", err);
      setCpfError("Não foi possível verificar agora. Tente novamente.");
      setStep("identify");
    }
  }

  async function handleSign() {
    if (!signature || !doc) {
      setSignError("Sua assinatura é necessária para confirmar.");
      return;
    }
    setSignError("");
    setStep("submitting");
    try {
      const res = await fetch(`/api/evolucao-assinatura/${encodeURIComponent(token)}/assinar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataUrl: signature.dataUrl,
          strokeData: signature.strokeData,
          contentHashConfirmed: doc.contentHash,
          scrollCompleto: true,
          needsConsentAcceptance: !!statusData?.needsConsent,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const messages: Record<string, string> = {
          content_mismatch: "O conteúdo mudou desde que você começou a ler. Atualize a página e revise novamente.",
          invalid_status: "Este documento não está mais disponível para assinatura.",
          patient_no_phone: "Não foi possível concluir — entre em contato com a clínica.",
        };
        setSignError(messages[body?.error] || "Não foi possível enviar sua assinatura agora. Tente novamente.");
        setStep("sign");
        return;
      }
      const result = (await res.json()) as { verification_code: string };
      setVerificationCode(result.verification_code);
      setStep("success");
    } catch (err) {
      console.error("Falha ao assinar evolução:", err);
      setSignError("Não foi possível enviar sua assinatura agora. Tente novamente.");
      setStep("sign");
    }
  }

  async function handleRefuse() {
    setStep("refusing");
    try {
      const res = await fetch(`/api/evolucao-assinatura/${encodeURIComponent(token)}/recusar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: refuseReason.trim() || null }),
      });
      if (!res.ok) {
        setStep("refuse");
        return;
      }
      setStep("refused");
    } catch (err) {
      console.error("Falha ao recusar assinatura:", err);
      setStep("refuse");
    }
  }

  const canContinue = scrollCompleto && (!statusData?.needsConsent || consentChecked);

  return (
    <div className="wrap">
      <header style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        {(doc?.clinicLogoUrl || statusData?.clinicLogoUrl) && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={doc?.clinicLogoUrl || statusData?.clinicLogoUrl || ""}
            alt=""
            style={{ width: 32, height: 32, objectFit: "contain", borderRadius: 6 }}
          />
        )}
        <span style={{ fontFamily: "Georgia, serif", fontWeight: 600, fontSize: 17, color: "var(--brand-deep)" }}>
          {doc?.clinicName || statusData?.clinicName || "Clínica"}
        </span>
      </header>

      {step === "loading" && (
        <div className="card" style={{ textAlign: "center", padding: "48px 20px", color: "var(--ink-soft)" }}>
          Carregando…
        </div>
      )}

      {step === "not-found" && (
        <div className="card" style={{ textAlign: "center" }}>
          <h1>Link inválido</h1>
          <p style={{ color: "var(--ink-soft)" }}>
            Não encontramos nenhum documento para este link. Verifique se o endereço foi copiado corretamente.
          </p>
        </div>
      )}

      {step === "terminal" && statusData?.status === "assinada" && (
        <div className="card" style={{ textAlign: "center" }}>
          <h1>Documento já assinado</h1>
          <p style={{ color: "var(--ink-soft)" }}>Esta evolução já foi assinada anteriormente.</p>
          <a
            href={`/api/evolucao-assinatura/${encodeURIComponent(token)}/pdf`}
            download="evolucao-assinada.pdf"
            style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 8,
              background: "var(--surface)", border: "1.5px solid var(--line)", color: "var(--ink)",
              borderRadius: "var(--radius-sm)", padding: "12px 20px", fontSize: 14.5, fontWeight: 600, textDecoration: "none",
            }}
          >
            Baixar minha cópia em PDF
          </a>
        </div>
      )}

      {step === "terminal" && statusData?.status === "recusada" && (
        <div className="card" style={{ textAlign: "center" }}>
          <h1>Assinatura recusada</h1>
          <p style={{ color: "var(--ink-soft)" }}>
            Você recusou assinar este documento. A clínica já foi avisada e vai entrar em contato.
          </p>
        </div>
      )}

      {step === "terminal" && statusData?.status === "expirada" && (
        <div className="card" style={{ textAlign: "center" }}>
          <h1>Link expirado</h1>
          <p style={{ color: "var(--ink-soft)" }}>
            Este link de assinatura venceu. Peça à clínica para enviar um novo.
          </p>
        </div>
      )}

      {(step === "identify" || step === "verifying") && statusData && (
        <div className="card">
          <p style={{ textTransform: "uppercase", fontSize: 11.5, fontWeight: 700, color: "var(--brand)", margin: "0 0 10px" }}>
            Confirmação de identidade
          </p>
          <h1>Confirme que é você</h1>
          <p style={{ color: "var(--ink-soft)", fontSize: 14.5, marginBottom: 18 }}>
            Documento para <strong style={{ color: "var(--brand-deep)" }}>{statusData.patientNameMasked}</strong>. Para abrir,
            confirme seu CPF cadastrado na clínica.
          </p>

          <div className="field">
            <label htmlFor="cpf">CPF</label>
            <input
              id="cpf"
              type="text"
              inputMode="numeric"
              value={cpf}
              onChange={(e) => setCpf(formatCPF(e.target.value))}
              placeholder="000.000.000-00"
              maxLength={14}
              disabled={step === "verifying"}
            />
            {cpfError && <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 5 }}>{cpfError}</div>}
          </div>

          <button className="btn-primary" disabled={step === "verifying"} onClick={submitCpf} style={{ marginTop: 8 }}>
            {step === "verifying" ? "Verificando…" : "Continuar"}
          </button>
        </div>
      )}

      {step === "review" && doc && (
        <div style={{ paddingBottom: 96 }}>
          <div className="card">
            <p style={{ textTransform: "uppercase", fontSize: 11.5, fontWeight: 700, color: "var(--brand)", margin: "0 0 10px" }}>
              Revisão
            </p>
            <h1>Confira a evolução</h1>
            <p style={{ color: "var(--ink-soft)", fontSize: 14.5, marginBottom: 14 }}>
              Leia até o final antes de continuar para a assinatura.
            </p>

            <div
              ref={scrollAreaRef}
              onScroll={handleScroll}
              style={{
                maxHeight: 340,
                overflowY: "auto",
                border: "1px solid var(--line)",
                borderRadius: "var(--radius-sm)",
                padding: "14px 16px",
              }}
            >
              <dl style={{ margin: "0 0 16px" }}>
                <div style={{ marginBottom: 8 }}>
                  <dt style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>Paciente</dt>
                  <dd style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>{doc.snapshot.patient.name}</dd>
                </div>
                <div style={{ marginBottom: 8 }}>
                  <dt style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>Dentista responsável</dt>
                  <dd style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>
                    {doc.snapshot.dentist.name} — CRO {doc.snapshot.dentist.cro}/{doc.snapshot.dentist.croUf}
                  </dd>
                </div>
                <div style={{ marginBottom: 8 }}>
                  <dt style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>{doc.snapshot.treatments.length > 1 ? "Tratamentos" : "Tratamento"}</dt>
                  <dd style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>{formatTreatmentsLabel(doc.snapshot.treatments)}</dd>
                </div>
                <div>
                  <dt style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>Data</dt>
                  <dd style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>{formatDateBR(doc.snapshot.evolutionDate)}</dd>
                </div>
              </dl>

              <div style={{ borderTop: "1px solid var(--line)", paddingTop: 14, whiteSpace: "pre-wrap", fontSize: 14.5, lineHeight: 1.6 }}>
                {doc.snapshot.text}
              </div>

              {statusData?.needsConsent && doc.consentTermText && (
                <>
                  <div style={{ borderTop: "1px solid var(--line)", marginTop: 20, paddingTop: 16 }}>
                    <p style={{ textTransform: "uppercase", fontSize: 11.5, fontWeight: 700, color: "var(--brand)", margin: "0 0 10px" }}>
                      Termo de Adesão Eletrônica
                    </p>
                    {/* consentTermText já vem saneado no momento em que a clínica salva
                        (única rota de escrita, ver sanitizeConsentTermHtml) — allowlist
                        restrita a negrito/itálico/sublinhado/tamanho/lista, sem script. */}
                    <div
                      className={richTextStyles.richContent}
                      style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-soft)" }}
                      dangerouslySetInnerHTML={{ __html: doc.consentTermText }}
                    />
                  </div>
                </>
              )}
            </div>

            {!scrollCompleto && (
              <p style={{ fontSize: 12.5, color: "var(--ink-faint)", marginTop: 8 }}>Role até o final do texto para continuar.</p>
            )}

            {statusData?.needsConsent && (
              <label
                htmlFor="consentCheck"
                style={{
                  display: "flex", gap: 12, alignItems: "flex-start", background: "var(--brand-tint)",
                  borderRadius: "var(--radius-sm)", padding: "14px 15px", margin: "16px 0 0", cursor: "pointer", minHeight: 44,
                }}
              >
                <input
                  type="checkbox"
                  id="consentCheck"
                  checked={consentChecked}
                  disabled={!scrollCompleto}
                  onChange={(e) => setConsentChecked(e.target.checked)}
                  style={{ width: 22, height: 22, marginTop: 1, flex: "none", accentColor: "var(--brand)" }}
                />
                <span style={{ fontSize: 13, color: "var(--brand-deep)", lineHeight: 1.5 }}>
                  Li e aceito o Termo de Adesão Eletrônica acima.
                </span>
              </label>
            )}
          </div>

          <div className="sticky-actions">
            <div className="sticky-actions-inner" style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                onClick={() => setStep("refuse")}
                style={{ border: "1.5px solid var(--line)", background: "var(--surface)", color: "var(--ink)", borderRadius: "var(--radius-sm)", padding: "0 18px", fontSize: 14.5, fontWeight: 600, cursor: "pointer" }}
              >
                Recusar
              </button>
              <button className="btn-primary" disabled={!canContinue} onClick={() => setStep("sign")} style={{ flex: 1 }}>
                Continuar para assinatura
              </button>
            </div>
          </div>
        </div>
      )}

      {(step === "sign" || step === "submitting") && doc && (
        <div style={{ paddingBottom: 96 }}>
          <button
            type="button"
            onClick={() => setStep("review")}
            style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none", color: "var(--ink-soft)", fontSize: 14, fontWeight: 600, cursor: "pointer", padding: "8px 0", marginBottom: 8 }}
          >
            ‹ Voltar pra revisão
          </button>

          <div className="card" style={{ border: "1.5px solid var(--sign-line)" }}>
            <p style={{ display: "flex", alignItems: "center", gap: 8, textTransform: "uppercase", fontSize: 11.5, fontWeight: 700, color: "var(--sign)", margin: "0 0 10px" }}>
              <SignatureMark size={26} />
              Assinatura
            </p>
            <h1>Confirme e assine</h1>
            <p style={{ color: "var(--ink-soft)", fontSize: 14.5, marginBottom: 18 }}>
              Sua assinatura eletrônica será anexada a esta evolução clínica junto com data, hora e demais dados de
              identificação.
            </p>

            <SignatureCanvas onChange={setSignature} />
            {signError && <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 10 }}>{signError}</div>}

            <p style={{ fontSize: 12, color: "var(--ink-soft)", textAlign: "center", margin: "16px 0 0", lineHeight: 1.5 }}>
              Ao confirmar, registramos data, hora, IP e dispositivo como parte da trilha de autenticação deste
              documento.
            </p>
          </div>

          <div className="sticky-actions">
            <div className="sticky-actions-inner">
              <button className="btn-primary" disabled={step === "submitting" || !signature} onClick={handleSign}>
                {step === "submitting" ? "Enviando…" : "Confirmar e assinar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {(step === "refuse" || step === "refusing") && (
        <div className="card">
          <h1>Recusar assinatura</h1>
          <p style={{ color: "var(--ink-soft)", fontSize: 14.5, marginBottom: 14 }}>
            Se preferir, conte pra clínica o motivo — isso ajuda a resolver mais rápido. É opcional.
          </p>
          <div className="field">
            <label htmlFor="reason">Motivo (opcional)</label>
            <textarea
              id="reason"
              rows={3}
              value={refuseReason}
              onChange={(e) => setRefuseReason(e.target.value)}
              style={{ width: "100%", fontSize: 15, fontFamily: "inherit", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line)", resize: "vertical" }}
            />
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <button type="button" onClick={() => setStep("review")} style={{ border: "1.5px solid var(--line)", background: "var(--surface)", color: "var(--ink)", borderRadius: "var(--radius-sm)", padding: "12px 18px", fontSize: 14.5, fontWeight: 600, cursor: "pointer" }}>
              Voltar
            </button>
            <button className="btn-primary" disabled={step === "refusing"} onClick={handleRefuse} style={{ flex: 1 }}>
              {step === "refusing" ? "Enviando…" : "Confirmar recusa"}
            </button>
          </div>
        </div>
      )}

      {step === "refused" && (
        <div className="card" style={{ textAlign: "center" }}>
          <h1>Recusa registrada</h1>
          <p style={{ color: "var(--ink-soft)" }}>A clínica foi avisada e vai entrar em contato com você.</p>
        </div>
      )}

      {step === "success" && (
        <div className="card" style={{ textAlign: "center", padding: "20px 4px" }}>
          <h1>Documento assinado</h1>
          <p style={{ color: "var(--ink-soft)", fontSize: 14.5, marginBottom: 8 }}>
            Obrigado! Sua evolução foi assinada com sucesso. A clínica já recebeu uma cópia.
          </p>
          {verificationCode && (
            <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginBottom: 22 }}>
              Código de verificação: <strong style={{ color: "var(--brand-deep)" }}>{verificationCode.match(/.{1,4}/g)?.join("-") ?? verificationCode}</strong>
            </p>
          )}
          <a
            href={`/api/evolucao-assinatura/${encodeURIComponent(token)}/pdf`}
            download="evolucao-assinada.pdf"
            style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
              background: "var(--surface)", border: "1.5px solid var(--line)", color: "var(--ink)",
              borderRadius: "var(--radius-sm)", padding: "12px 20px", fontSize: 14.5, fontWeight: 600, textDecoration: "none",
            }}
          >
            Baixar minha cópia em PDF
          </a>
        </div>
      )}
    </div>
  );
}
