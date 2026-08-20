import type { AgentCertificate } from "@/components/AgentDetector";

export type SignAnamnesisResult = { ok: true } | { ok: false; error: string };

function certToPem(cert: AgentCertificate): string {
  return cert.certificateChainBase64
    .map((b64) => `-----BEGIN CERTIFICATE-----\n${b64.match(/.{1,64}/g)?.join("\n") || b64}\n-----END CERTIFICATE-----`)
    .join("\n");
}

/**
 * Orquestra a contra-assinatura ICP-Brasil de UMA anamnese com o agente
 * local — mesmo desenho de `signEvolutionAsDentist`, função pura (não hook).
 * `signHash` vem de `useAgent()`, chamado uma vez no componente e passado
 * adiante.
 */
export async function signAnamnesisAsDentist(
  clinicId: string,
  anamnesisId: string,
  cert: AgentCertificate,
  signHash: (thumbprint: string, hashBase64: string) => Promise<string>
): Promise<SignAnamnesisResult> {
  const issueRes = await fetch(`/api/clinics/${clinicId}/anamneses/${anamnesisId}/assinar-dentista`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signerCertificatePem: certToPem(cert) }),
  });
  const issueData = await issueRes.json();
  if (!issueRes.ok) return { ok: false, error: issueData.message || issueData.error || "Falha ao iniciar a assinatura." };

  if (issueData.finished) return { ok: true };
  if (!issueData.externalSigning) return { ok: false, error: "Resposta inesperada do servidor." };

  let signatureBase64: string;
  try {
    signatureBase64 = await signHash(cert.thumbprint, issueData.externalSigning.hashToSignBase64);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Falha ao assinar com o agente local." };
  }

  const finishRes = await fetch(`/api/clinics/${clinicId}/anamneses/${anamnesisId}/assinar-dentista/finish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signatureSessionId: issueData.externalSigning.signatureSessionId, signatureBase64 }),
  });
  const finishData = await finishRes.json();
  if (!finishRes.ok) return { ok: false, error: finishData.message || finishData.error || "Falha ao finalizar a assinatura." };

  return { ok: true };
}
