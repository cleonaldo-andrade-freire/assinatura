"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useEscapeToClose } from "@/lib/useEscapeToClose";
import uiStyles from "@/components/ui/ui.module.css";

/** Moldura comum dos modais da locação — mesmo visual dos outros modais do app. */
export function Modal({
  open,
  title,
  onClose,
  children,
  actions,
  escEnabled = true,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  actions: ReactNode;
  /** false quando outro modal está aberto por cima e já trata o Esc. */
  escEnabled?: boolean;
}) {
  useEscapeToClose(onClose, open && escEnabled);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className={uiStyles.overlay} onClick={onClose}>
      <div className={`${uiStyles.dialog} ${uiStyles.dialogWide}`} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h3 className={uiStyles.dialogTitle}>{title}</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 6, overflowY: "auto" }}>{children}</div>
        <div className={uiStyles.dialogActions} style={{ marginTop: 20 }}>
          {actions}
        </div>
      </div>
    </div>,
    document.body
  );
}

/** POST/PATCH em JSON — devolve a mensagem de erro da rota quando houver. */
export async function callApi(url: string, body: unknown, method: "POST" | "PATCH" = "POST"): Promise<{ ok: true; data: unknown } | { ok: false; message: string }> {
  try {
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
    const data = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, message: data?.message || "Não foi possível salvar. Tenta de novo." };
    return { ok: true, data };
  } catch {
    return { ok: false, message: "Falha de conexão. Tenta de novo." };
  }
}

const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** "2026-10-13" → "ter 13/10" — string pura, sem fuso (coluna date). */
export function dayLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${WEEKDAYS[weekday]} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}
