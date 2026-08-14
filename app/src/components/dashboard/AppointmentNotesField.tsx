"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ToastStack, useToasts } from "@/components/ui/Toast";
import { useEscapeToClose } from "@/lib/useEscapeToClose";
import uiStyles from "@/components/ui/ui.module.css";
import styles from "@/styles/shell.module.css";

/**
 * Linha "Observação" do detalhe de agendamento — sempre visível (mesmo
 * vazia), porque a observação pode surgir depois de agendado (ex.: paciente
 * liga com mais informação), não só na criação. Edição em modal — inline
 * dentro do card ficava ruim (textarea empurrando o resto do conteúdo).
 */
export function AppointmentNotesField({ clinicId, appointmentId, notes }: { clinicId: string; appointmentId: string; notes: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(notes ?? "");
  const [saving, setSaving] = useState(false);
  const { toasts, push, dismiss } = useToasts();

  useEscapeToClose(() => !saving && setOpen(false), open);

  function startEdit() {
    setDraft(notes ?? "");
    setOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/appointments/${appointmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: draft.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        push(data.message || data.error || "Falha ao salvar a observação.");
        return;
      }
      setOpen(false);
      push("Observação salva.", "success");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: "12px 0 4px", borderTop: "1px solid var(--line)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: notes ? 8 : 0 }}>
        <span style={{ color: "var(--ink-soft)", fontSize: 13.5 }}>Observação</span>
        <button
          type="button"
          onClick={startEdit}
          style={{ border: "none", background: "none", color: "var(--brand)", cursor: "pointer", fontSize: 12.5, fontWeight: 600, padding: 0 }}
        >
          {notes ? "Editar" : "+ Adicionar"}
        </button>
      </div>
      {notes && (
        <div
          style={{
            background: "var(--surface-sunken)",
            borderRadius: "var(--radius-sm)",
            padding: "10px 12px",
            fontSize: 13.5,
            lineHeight: 1.5,
            whiteSpace: "pre-wrap",
          }}
        >
          {notes}
        </div>
      )}

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div className={uiStyles.overlay} onClick={() => !saving && setOpen(false)}>
            <div className={uiStyles.dialog} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
                <h3 className={uiStyles.dialogTitle}>Observação</h3>
                <button type="button" className={uiStyles.toastClose} onClick={() => setOpen(false)} aria-label="Fechar">
                  ×
                </button>
              </div>

              <textarea
                className={styles.input}
                rows={6}
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Motivo da consulta, anotação da recepção…"
              />

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
                <button type="button" disabled={saving} onClick={() => setOpen(false)} className={`${styles.btn} ${styles.btnGhost}`}>
                  Cancelar
                </button>
                <button type="button" disabled={saving} onClick={handleSave} className={`${styles.btn} ${styles.btnPrimary}`}>
                  {saving ? "Salvando…" : "Salvar"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
