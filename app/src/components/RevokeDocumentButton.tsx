"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ToastStack, useToasts } from "@/components/ui/Toast";
import styles from "@/styles/shell.module.css";

export function RevokeDocumentButton({ revokeUrl }: { revokeUrl: string }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [reason, setReason] = useState("");
  const [revoking, setRevoking] = useState(false);
  const { toasts, push, dismiss } = useToasts();

  async function handleRevoke() {
    setRevoking(true);
    try {
      const res = await fetch(revokeUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() || undefined }),
      });
      if (!res.ok) {
        push("Falha ao revogar. Tenta de novo.");
        return;
      }
      router.refresh();
    } finally {
      setRevoking(false);
    }
  }

  if (!expanded) {
    return (
      <>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className={`${styles.btn} ${styles.btnGhost}`}
          style={{ color: "var(--danger)" }}
        >
          Revogar documento
        </button>
        <ToastStack toasts={toasts} onDismiss={dismiss} />
      </>
    );
  }

  return (
    <div
      style={{
        border: "1px solid var(--line)",
        borderRadius: "var(--radius-sm)",
        padding: 14,
        width: "100%",
      }}
    >
      <p style={{ margin: "0 0 8px", fontSize: 13.5, fontWeight: 600 }}>Revogar este documento</p>
      <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--ink-soft)" }}>
        Ele deixa de ser confirmado como válido no portal público de validação. Não dá pra desfazer.
      </p>
      <textarea
        className={styles.input}
        rows={2}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Motivo (opcional, fica só no registro interno)"
        style={{ marginBottom: 10 }}
      />
      <div style={{ display: "flex", gap: 10 }}>
        <button
          type="button"
          onClick={handleRevoke}
          disabled={revoking}
          className={`${styles.btn} ${styles.btnPrimary}`}
          style={{ background: "var(--danger)" }}
        >
          {revoking ? "Revogando…" : "Confirmar revogação"}
        </button>
        <button type="button" onClick={() => setExpanded(false)} className={`${styles.btn} ${styles.btnGhost}`}>
          Cancelar
        </button>
      </div>
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
