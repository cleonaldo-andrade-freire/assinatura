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
  children,
}: {
  title: string;
  subtitle?: string;
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

  return (
    <div className={uiStyles.overlay} onClick={() => router.back()}>
      <div
        className={`${uiStyles.dialog} ${uiStyles.dialogWide}`}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14, flexShrink: 0 }}>
          <div>
            <h3 className={uiStyles.dialogTitle}>{title}</h3>
            {subtitle && <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--ink-soft)" }}>{subtitle}</p>}
          </div>
          <button type="button" className={uiStyles.toastClose} onClick={() => router.back()} aria-label="Fechar">
            ×
          </button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16, paddingRight: 6 }}>
          {children}
        </div>
      </div>
    </div>
  );
}
