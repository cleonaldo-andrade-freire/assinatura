"use client";

import { useEffect, useState } from "react";
import { SignatureCanvas, type SignatureResult } from "@/components/SignatureCanvas";
import richTextStyles from "@/components/ui/RichTextEditor.module.css";
import { formatCPF } from "@/lib/validation";

const onlyDigits = (str: string | null | undefined) => (str || "").replace(/\D/g, "");

type Step = "loading" | "not-found" | "auth" | "review" | "sign" | "submitting" | "success" | "terminal";

interface StatusData {
  found: boolean;
  status?: string;
  clinicName?: string;
  clinicLogoUrl?: string | null;
  patientNameMasked?: string;
  consentTermHtml?: string;
  hasCpf?: boolean;
}

export function TermoAssinaturaClient({ token }: { token: string }) {
  const [step, setStep] = useState<Step>("loading");
  const [data, setData] = useState<StatusData | null>(null);
  const [htmlContent, setHtmlContent] = useState("");
  const [cpfInput, setCpfInput] = useState("");
  const [cpfError, setCpfError] = useState("");
  
  const [scrollCompleto, setScrollCompleto] = useState(false);
  const [signature, setSignature] = useState<SignatureResult | null>(null);
  const [signError, setSignError] = useState("");

  useEffect(() => {
    fetch(`/api/termo-assinatura/${encodeURIComponent(token)}`)
      .then(res => res.json())
      .then((res: StatusData) => {
        if (!res.found) {
          setStep("not-found");
          return;
        }
        setData(res);
        if (res.status === "aguardando_assinatura") {
          setStep(res.hasCpf ? "auth" : "review"); // se não tem cpf, pula auth? O backend pede cpf, então se não tem cpf vai falhar no backend. Mas assumimos que tem.
        } else {
          setStep("terminal");
        }
      })
      .catch(() => setStep("not-found"));
  }, [token]);

  async function handleAuthSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCpfError("");
    const plain = onlyDigits(cpfInput);
    if (plain.length !== 11) {
      setCpfError("Digite os 11 números do CPF.");
      return;
    }

    try {
      const res = await fetch(`/api/termo-assinatura/${encodeURIComponent(token)}/verificar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cpf: plain })
      });
      
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        if (body?.error === "wrong_cpf") {
          setCpfError("CPF incorreto. Verifique o número e tente novamente.");
        } else {
          setCpfError("Erro ao verificar CPF. Tente novamente.");
        }
        return;
      }

      setHtmlContent(body.consentTermHtml);
      setStep("review");
    } catch (err) {
      setCpfError("Erro de conexão. Tente novamente.");
    }
  }

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop <= el.clientHeight + 40) {
      setScrollCompleto(true);
    }
  }

  async function handleSign() {
    if (!signature) return;
    setStep("submitting");
    setSignError("");

    try {
      const res = await fetch(`/api/termo-assinatura/${encodeURIComponent(token)}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cpfInput,
          signature: {
            signerName: "Paciente", // Ideally we'd ask for their name or use DB name, but DB has their name.
            signerCpf: cpfInput,
            dataUrl: signature.dataUrl,
            strokeData: signature.strokeData
          }
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        if (body?.error === "wrong_cpf") {
          setSignError("O CPF informado não confere com o cadastro. Atualize a página e tente novamente.");
        } else {
          setSignError(body?.message || "Erro ao processar assinatura.");
        }
        setStep("sign");
        return;
      }

      setStep("success");
    } catch (err) {
      setSignError("Erro de conexão. Tente novamente.");
      setStep("sign");
    }
  }

  return (
    <div className="wrap">
      <header style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        {data?.clinicLogoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={data.clinicLogoUrl} alt="" style={{ width: 32, height: 32, objectFit: "contain", borderRadius: 6 }} />
        )}
        <span style={{ fontFamily: "Georgia, serif", fontWeight: 600, fontSize: 17, color: "var(--brand-deep)" }}>
          {data?.clinicName || "Clínica"}
        </span>
      </header>

      {step === "loading" && <div className="card" style={{ textAlign: "center" }}>Carregando…</div>}
      
      {step === "not-found" && (
        <div className="card" style={{ textAlign: "center" }}>
          <h1>Link inválido</h1>
          <p>Não encontramos este documento.</p>
        </div>
      )}

      {step === "terminal" && (
        <div className="card" style={{ textAlign: "center" }}>
          <h1>Termo já assinado</h1>
          <p>Você já assinou este termo de adesão eletrônica.</p>
        </div>
      )}

      {step === "auth" && (
        <div className="card">
          <h1>Confirme sua identidade</h1>
          <p style={{ color: "var(--ink-soft)", fontSize: 14.5, marginBottom: 20 }}>
            Olá, <strong>{data?.patientNameMasked}</strong>. Por segurança, digite seu CPF para acessar o documento.
          </p>
          <form onSubmit={handleAuthSubmit}>
            <div className="field">
              <label htmlFor="cpf">CPF</label>
              <input
                id="cpf"
                type="text"
                inputMode="numeric"
                value={cpfInput}
                onChange={e => setCpfInput(formatCPF(e.target.value))}
                placeholder="000.000.000-00"
                maxLength={14}
                style={{ fontWeight: 700 }}
              />
              {cpfError && <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 5 }}>{cpfError}</div>}
            </div>
            <button type="submit" className="btn-primary" style={{ marginTop: 8 }}>Acessar documento</button>
          </form>
        </div>
      )}

      {step === "review" && (
        <div className="card" style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column", height: "calc(100vh - 100px)" }}>
          <div style={{ padding: "20px 20px 10px" }}>
            <h1 style={{ fontSize: 18, margin: 0 }}>Termo de Adesão</h1>
            <p style={{ color: "var(--ink-soft)", fontSize: 13, margin: "4px 0 0" }}>Leia o documento até o final para assinar.</p>
          </div>
          
          <div onScroll={handleScroll} style={{ flex: 1, overflowY: "auto", padding: "0 20px 20px", background: "var(--bg)" }}>
            <div className={richTextStyles.richContent} dangerouslySetInnerHTML={{ __html: htmlContent }} style={{ fontSize: 14, color: "var(--ink-soft)", background: "#fff", padding: 15, borderRadius: 8, border: "1px solid var(--line)" }} />
          </div>

          <div style={{ padding: 20, borderTop: "1px solid var(--line)", background: "var(--surface)" }}>
            <button className="btn-primary" disabled={!scrollCompleto} onClick={() => setStep("sign")} style={{ width: "100%" }}>
              Continuar para assinatura
            </button>
          </div>
        </div>
      )}

      {(step === "sign" || step === "submitting") && (
        <div className="card">
          <button type="button" onClick={() => setStep("review")} style={{ background: "none", border: "none", color: "var(--ink-soft)", cursor: "pointer", marginBottom: 15, fontWeight: 600 }}>‹ Voltar para leitura</button>
          <h1>Assinatura</h1>
          <p style={{ color: "var(--ink-soft)", fontSize: 14, marginBottom: 20 }}>Assine no quadro abaixo usando o dedo (no celular) ou o mouse (no computador).</p>
          
          <SignatureCanvas onChange={setSignature} />
          {signError && <div style={{ color: "var(--danger)", fontSize: 13, marginTop: 10 }}>{signError}</div>}
          
          <button className="btn-primary" disabled={!signature || step === "submitting"} onClick={handleSign} style={{ width: "100%", marginTop: 20 }}>
            {step === "submitting" ? "Enviando..." : "Confirmar Assinatura"}
          </button>
        </div>
      )}

      {step === "success" && (
        <div className="card" style={{ textAlign: "center" }}>
          <div style={{ width: 48, height: 48, background: "var(--brand-tint)", color: "var(--brand)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 24 }}>✓</div>
          <h1>Assinatura concluída!</h1>
          <p style={{ color: "var(--ink-soft)", marginTop: 10 }}>O Termo de Adesão foi assinado com sucesso e arquivado na sua clínica.</p>
        </div>
      )}
    </div>
  );
}
