"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import uiStyles from "@/components/ui/ui.module.css";

/**
 * Moldura do modal de detalhe (agendamento/prótese), aberto por uma rota
 * interceptada (`@modal/(.)[id]`) — fechar (backdrop, X ou Esc) sempre
 * volta pra rota anterior via `router.back()`, já que a URL de fato mudou
 * pra `/dashboard/.../[id]` quando o modal abriu (não é um estado local
 * controlado por `useState`).
 */
export function DetailModalShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  /** Barra de ações fixa entre o cabeçalho e a área que rola. */
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const router = useRouter();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") router.back();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  // Sem travar o scroll do body, rolar a página por trás do overlay (fixed)
  // "vaza" pro conteúdo de trás em vez de rolar o modal — é exatamente o
  // "mexe a tela de fundo e não o modal" reportado.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  return (
    <div className={uiStyles.overlay} onClick={() => router.back()}>
      <div
        className={`${uiStyles.dialog} ${uiStyles.dialogTall}`}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sem botão de fechar — Esc (ou clicar fora) já fecha; a barra de
           ações sobe pra essa mesma linha do título, ganhando o espaço. */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14, flexShrink: 0 }}>
          <div>
            <h3 className={uiStyles.dialogTitle}>{title}</h3>
            {subtitle && <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--ink-soft)" }}>{subtitle}</p>}
          </div>
          {actions}
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12, paddingRight: 6 }}>
          {children}
        </div>
      </div>
    </div>
  );
}
