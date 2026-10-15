"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

// 127.0.0.1 em vez de "localhost" — em algumas máquinas (VPN/DNS corporativo/
// extensão de privacidade forçando DNS-over-HTTPS) a resolução do NOME
// "localhost" quebra (DNS_PROBE_FINISHED_NXDOMAIN no Chrome), mesmo com o
// agente rodando normalmente. O IP de loopback não depende de resolução de
// nome nenhuma, então não tem esse problema.
const AGENT_BASE_URL = "http://127.0.0.1:52310";

export interface AgentCertificate {
  thumbprint: string;
  subjectCommonName: string;
  holderName: string;
  holderCpf: string;
  issuer: string;
  notBefore: string;
  notAfter: string;
  certificateChainBase64: string[];
}

export type AgentDiagnosis =
  | { kind: "ok"; agentVersion?: string }
  // Agente respondeu, mas não libera esta origem no CORS (appsettings.json
  // sem a URL do site — ex.: agente aberto pelo autostart antes da v1.2.0).
  | { kind: "origin-blocked"; agentVersion?: string }
  // O próprio navegador barrou o acesso ao 127.0.0.1 (permissão "Acesso à
  // rede local" negada no Chrome/Edge).
  | { kind: "browser-blocked" }
  // Nada respondeu na porta — agente fechado, travado, ou algo (antivírus,
  // extensão) cortando a conexão antes de chegar nele.
  | { kind: "unreachable" };

const PROBE_TIMEOUT_MS = 4000;

function fetchWithTimeout(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  return fetch(url, { ...init, cache: "no-store", signal: controller.signal }).finally(() => clearTimeout(timer));
}

// Chrome/Edge expõem a permissão de acesso à rede local com nomes diferentes
// conforme a versão — tenta cada um e ignora os que o navegador não conhece.
async function isLocalNetworkPermissionDenied(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.permissions?.query) return false;
  for (const name of ["loopback-network", "local-network-access", "local-network"]) {
    try {
      const status = await navigator.permissions.query({ name } as unknown as PermissionDescriptor);
      if (status.state === "denied") return true;
    } catch {
      // Nome não suportado neste navegador.
    }
  }
  return false;
}

/**
 * Pro navegador, "agente desligado" e "agente rodando mas recusando este
 * site no CORS" são o mesmo TypeError genérico — por isso a mensagem antiga
 * dizia "não está rodando" mesmo com o ícone na bandeja. Aqui separa os casos:
 * o agente >= 1.2.0 deixa qualquer origem LER o /v1/status (com
 * `originAllowed`); pros agentes antigos, uma requisição `no-cors` (resposta
 * opaca, que o CORS não barra) prova que tem alguém escutando na porta.
 */
export async function diagnoseAgent(): Promise<AgentDiagnosis> {
  try {
    const res = await fetchWithTimeout(`${AGENT_BASE_URL}/v1/status`);
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data?.originAllowed === false) return { kind: "origin-blocked", agentVersion: data.agentVersion };
      return { kind: "ok", agentVersion: data?.agentVersion };
    }
  } catch {
    // Cai pras sondagens abaixo.
  }

  try {
    await fetchWithTimeout(`${AGENT_BASE_URL}/v1/status`, { mode: "no-cors" });
    return { kind: "origin-blocked" };
  } catch {
    // Nem a resposta opaca chegou.
  }

  if (await isLocalNetworkPermissionDenied()) return { kind: "browser-blocked" };
  return { kind: "unreachable" };
}

export function useAgent() {
  const [isAgentRunning, setIsAgentRunning] = useState<boolean | null>(null);
  const [diagnosis, setDiagnosis] = useState<AgentDiagnosis | null>(null);
  const [certificates, setCertificates] = useState<AgentCertificate[]>([]);

  useEffect(() => {
    checkAgent();
  }, []);

  const checkAgent = async () => {
    setIsAgentRunning(null);
    setDiagnosis(null);
    const result = await diagnoseAgent();
    setDiagnosis(result);
    setIsAgentRunning(result.kind === "ok");
    return result;
  };

  const loadCertificates = async () => {
    try {
      const res = await fetch(`${AGENT_BASE_URL}/v1/certificates`, { method: "GET" });
      if (res.ok) {
        const data = await res.json();
        setCertificates(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const signHash = async (thumbprint: string, hashBase64: string) => {
    const res = await fetch(`${AGENT_BASE_URL}/v1/sign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ thumbprint, hashBase64 })
    });
    if (!res.ok) {
      throw new Error("Erro ao assinar com o agente local.");
    }
    const data = await res.json();
    return data.signatureBase64;
  };

  return { isAgentRunning, diagnosis, certificates, loadCertificates, checkAgent, signHash };
}

const hintStyle = { margin: "8px 0 0", fontSize: 13, lineHeight: 1.5 } as const;
const codeStyle = { background: "rgba(0,0,0,0.06)", padding: "1px 5px", borderRadius: 4, fontSize: 12.5, wordBreak: "break-all" } as const;

/**
 * Explica o resultado de `diagnoseAgent()` com o passo a passo pra cada caso
 * e um botão de testar de novo. Usado no seletor de certificado (quando o
 * agente não está OK) e no painel do agente em Configurações.
 */
export function AgentDiagnosticPanel({
  diagnosis,
  onRetry,
}: {
  diagnosis: AgentDiagnosis | null;
  onRetry: () => void;
}) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const settingsJson = JSON.stringify({ AGENT_ALLOWED_ORIGINS: `http://localhost:3000,${origin}` }, null, 2);

  const box = (bg: string, fg: string, children: ReactNode) => (
    <div style={{ padding: 16, background: bg, color: fg, borderRadius: 6, fontSize: 14 }}>{children}</div>
  );

  let content: ReactNode;
  if (!diagnosis) {
    content = box("#f3f4f6", "#374151", "Testando o Agente de Assinatura Local…");
  } else if (diagnosis.kind === "ok") {
    content = box(
      "#ecfdf5",
      "#065f46",
      <>
        <strong>Agente de Assinatura funcionando.</strong>
        {diagnosis.agentVersion && <span> (versão {diagnosis.agentVersion})</span>}
      </>
    );
  } else if (diagnosis.kind === "origin-blocked") {
    content = box(
      "#fffbeb",
      "#92400e",
      <>
        <strong>O agente está rodando, mas não liberou este site.</strong>
        <p style={hintStyle}>
          Clique com o botão direito no ícone do agente na bandeja (perto do relógio) → <b>Liberar site bloqueado</b> →{" "}
          <span style={codeStyle}>{origin}</span>. Depois clique em “Testar novamente”.
        </p>
        <p style={hintStyle}>
          Se essa opção não aparecer no menu (versão antiga do agente), baixe e reinstale o agente em Configurações →
          Agente de Assinatura Digital. Ou, manualmente: no ícone da bandeja clique em <b>Sair</b>, abra o arquivo{" "}
          <span style={codeStyle}>%LOCALAPPDATA%\AssinaturaDigitalAgent\appsettings.json</span> no Bloco de Notas, deixe o
          conteúdo assim e abra o agente de novo pelo Menu Iniciar:
        </p>
        <pre style={{ ...codeStyle, display: "block", padding: 8, marginTop: 8, whiteSpace: "pre-wrap" }}>{settingsJson}</pre>
      </>
    );
  } else if (diagnosis.kind === "browser-blocked") {
    content = box(
      "#fef2f2",
      "#991b1b",
      <>
        <strong>O navegador está bloqueando o acesso ao agente.</strong>
        <p style={hintStyle}>
          Clique no ícone à esquerda do endereço do site (cadeado / ajustes) → <b>Configurações do site</b> → em{" "}
          <b>Acesso à rede local</b> (ou “Apps e serviços neste dispositivo”) escolha <b>Permitir</b>. Recarregue a
          página e teste novamente.
        </p>
      </>
    );
  } else {
    content = box(
      "#fef2f2",
      "#991b1b",
      <>
        <strong>O Agente de Assinatura Local não respondeu.</strong>
        <ol style={{ ...hintStyle, paddingLeft: 18 }}>
          <li>
            Abra pelo Menu Iniciar: <b>Assinatura Digital Agent</b>. Se o ícone já estiver na bandeja, clique nele com o
            botão direito → <b>Sair</b> e abra de novo.
          </li>
          <li>
            Abra{" "}
            <a href={`${AGENT_BASE_URL}/v1/status`} target="_blank" rel="noopener noreferrer" style={{ color: "inherit" }}>
              {AGENT_BASE_URL}/v1/status
            </a>{" "}
            numa nova aba. Se aparecer um texto com <span style={codeStyle}>agentVersion</span>, o agente está bem e
            quem está bloqueando é o navegador: confira a permissão “Acesso à rede local” deste site (ícone à esquerda
            do endereço) e extensões/antivírus com proteção web.
          </li>
          <li>Se a aba não abrir, reinstale o agente (Configurações → Agente de Assinatura Digital).</li>
        </ol>
      </>
    );
  }

  return (
    <div>
      {content}
      <div style={{ marginTop: 10 }}>
        <button
          type="button"
          onClick={onRetry}
          disabled={!diagnosis}
          style={{ padding: "6px 14px", background: "white", border: "1px solid #d1d5db", borderRadius: 6, cursor: diagnosis ? "pointer" : "default", fontSize: 13 }}
        >
          Testar novamente
        </button>
      </div>
    </div>
  );
}

/** Painel autônomo (Configurações) — roda o diagnóstico ao montar. */
export function AgentDiagnosticCheck() {
  const { diagnosis, checkAgent } = useAgent();
  return <AgentDiagnosticPanel diagnosis={diagnosis} onRetry={checkAgent} />;
}

interface AgentDetectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCertificateSelected: (cert: AgentCertificate) => void;
  requiredCpf?: string; // Se fornecido, só permite certificados deste CPF
}

export function AgentCertificateSelector({ open, onOpenChange, onCertificateSelected, requiredCpf }: AgentDetectorProps) {
  const { isAgentRunning, diagnosis, certificates, loadCertificates, checkAgent } = useAgent();

  // Testa de novo a cada abertura — o resultado do carregamento da página
  // pode estar velho (agente aberto/liberado depois disso).
  useEffect(() => {
    if (open) checkAgent();
  }, [open]);

  useEffect(() => {
    if (open && isAgentRunning) {
      loadCertificates();
    }
  }, [open, isAgentRunning]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => onOpenChange(false)}>
      <div style={{ background: "white", borderRadius: 8, padding: 24, width: "100%", maxWidth: 500, boxShadow: "0 10px 25px rgba(0,0,0,0.2)" }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 16px", fontSize: 18, fontWeight: 600 }}>Selecionar Certificado Digital</h3>
        
        {isAgentRunning !== true && <AgentDiagnosticPanel diagnosis={diagnosis} onRetry={checkAgent} />}

        {isAgentRunning === true && certificates.length === 0 && (
          <div style={{ padding: 16, color: "#6b7280", fontSize: 14, textAlign: "center" }}>
            Nenhum certificado digital e-CPF válido encontrado na sua máquina.
          </div>
        )}

        {isAgentRunning === true && certificates.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16, maxHeight: 300, overflowY: "auto" }}>
            {certificates.map((cert) => {
              const cpfMismatch = requiredCpf && cert.holderCpf !== requiredCpf.replace(/\D/g, "");
              
              return (
                <button
                  key={cert.thumbprint}
                  disabled={!!cpfMismatch}
                  onClick={() => onCertificateSelected(cert)}
                  style={{
                    width: "100%", textAlign: "left", padding: 12, border: "1px solid #d1d5db", borderRadius: 6,
                    background: cpfMismatch ? "#f9fafb" : "white",
                    opacity: cpfMismatch ? 0.6 : 1,
                    cursor: cpfMismatch ? "not-allowed" : "pointer"
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{cert.subjectCommonName}</div>
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>CPF: {cert.holderCpf}</div>
                  <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>Validade: {new Date(cert.notAfter).toLocaleDateString()}</div>
                  {cpfMismatch && (
                    <div style={{ fontSize: 12, color: "#ef4444", marginTop: 8, fontWeight: 500 }}>
                      CPF incompatível (esperado: {requiredCpf})
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
        
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
          <button 
            style={{ padding: "8px 16px", background: "transparent", border: "1px solid #d1d5db", borderRadius: 6, cursor: "pointer", fontSize: 14 }} 
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
