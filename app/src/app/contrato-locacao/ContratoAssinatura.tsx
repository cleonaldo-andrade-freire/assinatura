"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SignatureCanvas, type SignatureResult } from "@/components/SignatureCanvas";
import { SignatureMark } from "@/components/SignatureMark";

/** Aceite + assinatura com o dedo ou o mouse, no fim do contrato. */
export function ContratoAssinatura({ token, contentHash }: { token: string; contentHash: string }) {
  const router = useRouter();
  const [accepted, setAccepted] = useState(false);
  const [signature, setSignature] = useState<SignatureResult | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  async function handleSign() {
    if (!accepted) return setError("Marque que leu e concorda com o contrato.");
    if (!signature) return setError("Faça sua assinatura no quadro acima.");
    setError("");
    setSending(true);
    try {
      const res = await fetch(`/api/contrato-locacao/${encodeURIComponent(token)}/assinar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl: signature.dataUrl, strokeData: signature.strokeData, contentHashConfirmed: contentHash, accepted: true }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const messages: Record<string, string> = {
          already_signed: "Este contrato já foi assinado.",
          cancelled: "Esta locação foi cancelada pela clínica.",
          content_mismatch: "A clínica atualizou o contrato. Recarregue a página e leia de novo.",
          update_failed: "A clínica atualizou o contrato. Recarregue a página e leia de novo.",
          not_found: "Contrato não encontrado — peça um novo link à clínica.",
        };
        setError(messages[body?.error] || "Não foi possível enviar sua assinatura agora. Tente novamente.");
        return;
      }
      router.refresh();
    } catch {
      setError("Falha de conexão. Tente novamente.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="card" style={{ border: "1.5px solid var(--sign-line)", marginTop: 16 }}>
      <p style={{ display: "flex", alignItems: "center", gap: 8, textTransform: "uppercase", fontSize: 11.5, fontWeight: 700, color: "var(--sign)", margin: "0 0 10px" }}>
        <SignatureMark size={26} />
        Assinatura
      </p>

      <label
        htmlFor="accept"
        style={{ display: "flex", gap: 12, alignItems: "flex-start", background: "var(--brand-tint)", borderRadius: "var(--radius-sm)", padding: "14px 15px", marginBottom: 16, cursor: "pointer" }}
      >
        <input
          id="accept"
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          style={{ width: 22, height: 22, marginTop: 1, flex: "none", accentColor: "var(--brand)" }}
        />
        <span style={{ fontSize: 13.5, color: "var(--brand-deep)", lineHeight: 1.5 }}>Li o contrato acima e concordo com todas as cláusulas.</span>
      </label>

      <p style={{ fontSize: 14, color: "var(--ink-soft)", margin: "0 0 10px" }}>Assine no quadro abaixo com o dedo (celular) ou com o mouse (computador):</p>
      <SignatureCanvas onChange={setSignature} />

      {error && <div style={{ color: "var(--danger)", fontSize: 13, marginTop: 10 }}>{error}</div>}

      <button className="btn-primary" disabled={sending} onClick={handleSign} style={{ marginTop: 16 }}>
        {sending ? "Enviando…" : "Assinar contrato"}
      </button>
      <p style={{ fontSize: 12, color: "var(--ink-soft)", textAlign: "center", margin: "12px 0 0", lineHeight: 1.5 }}>
        Ao assinar, registramos data, hora, IP e dispositivo junto com sua assinatura.
      </p>
    </div>
  );
}

/** Imprimir / salvar em PDF pelo próprio navegador. */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      style={{
        marginTop: 14, background: "var(--surface)", border: "1.5px solid var(--line)", color: "var(--ink)",
        borderRadius: "var(--radius-sm)", padding: "10px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer",
      }}
    >
      Imprimir ou salvar em PDF
    </button>
  );
}
