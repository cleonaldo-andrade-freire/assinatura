"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

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

export function useAgent() {
  const [isAgentRunning, setIsAgentRunning] = useState<boolean | null>(null);
  const [certificates, setCertificates] = useState<AgentCertificate[]>([]);

  useEffect(() => {
    checkAgent();
  }, []);

  const checkAgent = async () => {
    try {
      const res = await fetch("http://localhost:52310/v1/status", { method: "GET" });
      if (res.ok) {
        setIsAgentRunning(true);
      } else {
        setIsAgentRunning(false);
      }
    } catch (e) {
      setIsAgentRunning(false);
    }
  };

  const loadCertificates = async () => {
    try {
      const res = await fetch("http://localhost:52310/v1/certificates", { method: "GET" });
      if (res.ok) {
        const data = await res.json();
        setCertificates(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const signHash = async (thumbprint: string, hashBase64: string) => {
    const res = await fetch("http://localhost:52310/v1/sign", {
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

  return { isAgentRunning, certificates, loadCertificates, checkAgent, signHash };
}

interface AgentDetectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCertificateSelected: (cert: AgentCertificate) => void;
  requiredCpf?: string; // Se fornecido, só permite certificados deste CPF
}

export function AgentCertificateSelector({ open, onOpenChange, onCertificateSelected, requiredCpf }: AgentDetectorProps) {
  const { isAgentRunning, certificates, loadCertificates } = useAgent();

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
        
        {isAgentRunning === false && (
          <div style={{ padding: 16, background: "#fef2f2", color: "#991b1b", borderRadius: 6, fontSize: 14 }}>
            O Agente de Assinatura Local não está rodando. Por favor, inicie o aplicativo "Agent.exe" no seu computador.
          </div>
        )}

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
