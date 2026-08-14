"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ToastStack, useToasts } from "@/components/ui/Toast";
import styles from "@/styles/shell.module.css";

/**
 * Linha "Observação" do detalhe de agendamento — sempre visível (mesmo
 * vazia) com edição inline, porque a observação pode surgir depois de
 * agendado (ex.: paciente liga com mais informação), não só na criação.
 */
export function AppointmentNotesField({ clinicId, appointmentId, notes }: { clinicId: string; appointmentId: string; notes: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(notes ?? "");
  const [saving, setSaving] = useState(false);
  const { toasts, push, dismiss } = useToasts();

  function startEdit() {
    setDraft(notes ?? "");
    setEditing(true);
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
      setEditing(false);
      push("Observação salva.", "success");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div style={{ padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
        <span style={{ color: "var(--ink-soft)", fontSize: 13.5, display: "block", marginBottom: 6 }}>Observação</span>
        <textarea
          className={styles.input}
          rows={3}
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Motivo da consulta, anotação da recepção…"
        />
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button type="button" disabled={saving} onClick={handleSave} className={`${styles.btn} ${styles.btnPrimary}`}>
            {saving ? "Salvando…" : "Salvar"}
          </button>
          <button type="button" disabled={saving} onClick={() => setEditing(false)} className={`${styles.btn} ${styles.btnGhost}`}>
            Cancelar
          </button>
        </div>
        <ToastStack toasts={toasts} onDismiss={dismiss} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
      <span style={{ color: "var(--ink-soft)", fontSize: 13.5 }}>Observação</span>
      <span style={{ fontSize: 13.5, textAlign: "right" }}>
        {notes ? <span style={{ whiteSpace: "pre-wrap" }}>{notes}</span> : <span style={{ color: "var(--ink-faint)" }}>—</span>}{" "}
        <button
          type="button"
          onClick={startEdit}
          style={{ border: "none", background: "none", color: "var(--brand)", cursor: "pointer", fontSize: 12.5, fontWeight: 600, padding: 0, marginLeft: 4 }}
        >
          {notes ? "Editar" : "+ Adicionar"}
        </button>
      </span>
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
