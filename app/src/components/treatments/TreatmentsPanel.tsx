"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ToastStack, useToasts } from "@/components/ui/Toast";
import { FinalizeTreatmentModal } from "@/components/treatments/FinalizeTreatmentModal";
import { formatMoneyDisplay, formatMoneyInput, parseMoneyInput } from "@/lib/money";
import { formatBRDate } from "@/lib/date";
import type { Treatment } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";
import tp from "./treatments.module.css";

export function TreatmentsPanel({
  clinicId,
  professionalName,
  initialTreatments,
}: {
  clinicId: string;
  professionalName: string;
  initialTreatments: Treatment[];
}) {
  const router = useRouter();
  const [treatments, setTreatments] = useState(initialTreatments);
  useEffect(() => setTreatments(initialTreatments), [initialTreatments]);

  const [showFinalized, setShowFinalized] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editTooth, setEditTooth] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [finalizeIds, setFinalizeIds] = useState<string[] | null>(null);
  const { toasts, push, dismiss } = useToasts();

  const visible = showFinalized ? treatments : treatments.filter((t) => t.status === "aberto");
  const finalizeTargets = finalizeIds ? treatments.filter((t) => finalizeIds.includes(t.id)) : [];

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function startEdit(t: Treatment) {
    setEditingId(t.id);
    setEditName(t.treatment_name);
    setEditTooth(t.tooth_region ?? "");
    setEditPrice(formatMoneyDisplay(t.price));
  }

  async function handleSaveEdit(id: string) {
    if (!editName.trim()) {
      push("Preencha o nome do tratamento.");
      return;
    }
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/treatments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ treatment_name: editName.trim(), tooth_region: editTooth.trim() || null, price: parseMoneyInput(editPrice) }),
      });
      const data = await res.json();
      if (!res.ok) {
        push("Falha ao salvar. Tenta de novo.");
        return;
      }
      setTreatments((prev) => prev.map((t) => (t.id === id ? (data.treatment as Treatment) : t)));
      setEditingId(null);
      router.refresh();
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/treatments/${id}`, { method: "DELETE" });
      if (!res.ok) {
        push("Falha ao excluir. Tenta de novo.");
        return;
      }
      setTreatments((prev) => prev.filter((t) => t.id !== id));
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setConfirmDeleteId(null);
      router.refresh();
    } finally {
      setDeletingId(null);
    }
  }

  async function handleFinalizeConfirm(finalizedAt: string, evolutionText: string) {
    if (!finalizeIds) return;
    const res = await fetch(`/api/clinics/${clinicId}/treatments/finalize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: finalizeIds, finalized_at: finalizedAt, evolution_text: evolutionText }),
    });
    if (!res.ok) {
      push("Falha ao finalizar. Tenta de novo.");
      return;
    }
    const data = await res.json();
    const updated = new Map((data.treatments as Treatment[]).map((t) => [t.id, t]));
    setTreatments((prev) => prev.map((t) => updated.get(t.id) ?? t));
    setSelected((prev) => {
      const next = new Set(prev);
      finalizeIds.forEach((id) => next.delete(id));
      return next;
    });
    push(`${finalizeIds.length === 1 ? "Tratamento finalizado" : `${finalizeIds.length} tratamentos finalizados`}.`, "success");
    setFinalizeIds(null);
    router.refresh();
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--ink-soft)", cursor: "pointer" }}>
          <input type="checkbox" checked={showFinalized} onChange={(e) => setShowFinalized(e.target.checked)} style={{ width: 18, height: 18, accentColor: "var(--brand)" }} />
          Mostrar finalizados
        </label>
      </div>

      {visible.length === 0 ? (
        <div className={styles.emptyState}>
          {showFinalized ? "Nenhum tratamento cadastrado ainda." : "Nenhum tratamento em aberto — aprove um orçamento pra gerar tratamentos aqui."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: selected.size > 0 ? 56 : 0 }}>
          {visible.map((t) =>
            editingId === t.id ? (
              <div key={t.id} className={tp.row}>
                <div style={{ flex: 1, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <input type="text" className={styles.input} style={{ flex: 2, minWidth: 160 }} value={editName} onChange={(e) => setEditName(e.target.value)} />
                  <input type="text" className={styles.input} style={{ width: 100 }} value={editTooth} onChange={(e) => setEditTooth(e.target.value)} placeholder="Dente" />
                  <input
                    type="text"
                    inputMode="numeric"
                    className={styles.input}
                    style={{ width: 110 }}
                    value={editPrice}
                    onChange={(e) => setEditPrice(formatMoneyInput(e.target.value))}
                    placeholder="0,00"
                  />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" disabled={savingEdit} onClick={() => handleSaveEdit(t.id)} className={`${styles.btn} ${styles.btnPrimary}`}>
                    {savingEdit ? "Salvando…" : "Salvar"}
                  </button>
                  <button type="button" disabled={savingEdit} onClick={() => setEditingId(null)} className={`${styles.btn} ${styles.btnGhost}`}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div key={t.id} className={tp.row}>
                {t.status === "aberto" ? (
                  <input
                    type="checkbox"
                    checked={selected.has(t.id)}
                    onChange={() => toggleSelected(t.id)}
                    style={{ width: 18, height: 18, accentColor: "var(--brand)", flexShrink: 0 }}
                  />
                ) : (
                  <span style={{ width: 18, flexShrink: 0 }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <button type="button" className={tp.name} onClick={() => startEdit(t)}>
                    {t.tooth_region ? `${t.tooth_region} — ` : ""}
                    {t.treatment_name}
                  </button>
                  <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                    Dr(a) {t.dentist_name}
                    {t.price_table_name ? ` — ${t.price_table_name}` : ""}
                    {t.status === "finalizado" && t.finalized_at ? ` — finalizado em ${formatBRDate(t.finalized_at)}` : ""}
                  </div>
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 600, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{formatMoneyDisplay(t.price)}</div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  {t.status === "aberto" ? (
                    <button type="button" onClick={() => setFinalizeIds([t.id])} className={`${styles.btn} ${styles.btnGhost}`}>
                      Finalizar
                    </button>
                  ) : (
                    <span className={`${styles.statusDot} ${styles.statusOk}`}>Finalizado</span>
                  )}
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(t.id)}
                    className={`${styles.btn} ${styles.btnGhost}`}
                    style={{ color: "var(--danger)" }}
                  >
                    Excluir
                  </button>
                </div>
              </div>
            )
          )}
        </div>
      )}

      {selected.size > 0 && (
        <div className={tp.bulkBar}>
          <span>
            {selected.size} tratamento{selected.size === 1 ? "" : "s"} selecionado{selected.size === 1 ? "" : "s"}
          </span>
          <button type="button" onClick={() => setFinalizeIds(Array.from(selected))} className={`${styles.btn} ${styles.btnPrimary}`}>
            Finalizar
          </button>
        </div>
      )}

      <FinalizeTreatmentModal
        open={finalizeIds !== null}
        onClose={() => setFinalizeIds(null)}
        onConfirm={handleFinalizeConfirm}
        professionalName={professionalName}
        treatments={finalizeTargets}
      />

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Excluir tratamento"
        message="Isso remove o tratamento da ficha do paciente. O orçamento que gerou ele não é afetado."
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        danger
        loading={deletingId !== null}
        onConfirm={() => confirmDeleteId && handleDelete(confirmDeleteId)}
        onCancel={() => setConfirmDeleteId(null)}
      />
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
