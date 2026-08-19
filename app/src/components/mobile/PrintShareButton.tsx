"use client";

import { useState } from "react";
import { useMobileV2Active } from "@/lib/useMobileV2Active";

/**
 * Botão "Imprimir" do shell mobile v2 (prompt §8, item 4) — a ação
 * principal quando o documento não tem assinatura digital: a dentista
 * imprime direto do celular numa impressora AirPrint. Renderizado direto
 * pelas páginas de detalhe (Server Components), mas só aparece de verdade
 * no mobile v2 — a checagem de viewport/flag é feita aqui dentro (client
 * component) pra não precisar de detecção de mobile no servidor (prompt
 * §2.1.3, item 2 — risco de cache servir o layout errado).
 *
 * Não existe API web que mande um PDF direto pra uma impressora AirPrint.
 * O caminho real no iOS é o share sheet do sistema, que traz "Imprimir"
 * como opção nativa — por isso `navigator.share({ files })` com o arquivo
 * (nunca com a URL: compartilhar URL de PDF privado abre o navegador em vez
 * do visualizador, e a signed URL/rota autenticada pode não funcionar fora
 * da sessão logada). Fallback: abre o PDF numa aba nova (usuário usa o
 * ícone de compartilhar → Imprimir do próprio visualizador).
 */
export function PrintShareButton({
  downloadUrl,
  fileName,
  label = "Imprimir",
  className,
}: {
  downloadUrl: string;
  fileName: string;
  label?: string;
  className?: string;
}) {
  const mobileV2 = useMobileV2Active();
  const [busy, setBusy] = useState(false);

  if (!mobileV2) return null;

  async function handleClick() {
    setBusy(true);
    try {
      const res = await fetch(downloadUrl);
      if (!res.ok) throw new Error("Falha ao baixar o PDF.");
      const blob = await res.blob();
      const file = new File([blob], fileName, { type: "application/pdf" });

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: fileName });
        return;
      }
      // Sem suporte a compartilhar arquivo (ou usuário cancelou e o browser
      // não distingue isso de falha) — abre no visualizador do sistema;
      // de lá dá pra imprimir pelo ícone de compartilhar nativo.
      window.open(downloadUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      // AbortError = usuário cancelou o share sheet, não é erro de verdade.
      if (err instanceof Error && err.name === "AbortError") return;
      window.open(downloadUrl, "_blank", "noopener,noreferrer");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" onClick={handleClick} disabled={busy} className={className}>
      {busy ? "Preparando…" : `🖨️ ${label}`}
    </button>
  );
}
