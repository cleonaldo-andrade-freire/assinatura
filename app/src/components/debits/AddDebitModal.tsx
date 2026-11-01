"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useEscapeToClose } from "@/lib/useEscapeToClose";
import { formatMoneyDisplay, formatMoneyInput, parseMoneyInput } from "@/lib/money";
import type { TreatmentDebit } from "@/lib/database.types";
import uiStyles from "@/components/ui/ui.module.css";
import styles from "@/styles/shell.module.css";

export type DebitTreatmentOption = {
  id: string;
  treatment_name: string;
  tooth_region: string | null;
  price: number;
};

function treatmentLabel(t: DebitTreatmentOption): string {
  return t.tooth_region ? `${t.treatment_name} — ${t.tooth_region}` : t.treatment_name;
}

/** Novo débito manual: ligado a um tratamento do paciente ou avulso. */
export function AddDebitModal({
  open,
  onClose,
  clinicId,
  patientId,
  treatments,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  clinicId: string;
  patientId: string;
  treatments: DebitTreatmentOption[];
  onCreated: (debit: TreatmentDebit) => void;
}) {
  const [kind, setKind] = useState<"tratamento" | "avulso">("avulso");
  const [treatmentId, setTreatmentId] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEscapeToClose(onClose, open);

  useEffect(() => {
    if (!open) return;
    setKind(treatments.length > 0 ? "tratamento" : "avulso");
    setTreatmentId("");
    setDescription("");
    setAmount("");
    setError(null);
  }, [open, treatments.length]);

  if (!open || typeof document === "undefined") return null;

  function handleTreatmentChange(id: string) {
    setTreatmentId(id);
    const t = treatments.find((x) => x.id === id);
    if (!t) return;
    // Pré-preenche com o tratamento; dá pra ajustar (ex.: cobrança complementar).
    setDescription(treatmentLabel(t));
    if (t.price > 0) setAmount(formatMoneyDisplay(t.price));
  }

  const parsedAmount = parseMoneyInput(amount);
  const canSubmit = description.trim().length > 0 && parsedAmount > 0 && (kind === "avulso" || !!treatmentId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/debits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_id: patientId,
          treatment_id: kind === "tratamento" ? treatmentId : null,
          description: description.trim(),
          amount: parsedAmount,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.message || "Falha ao lançar o débito. Tenta de novo.");
        return;
      }
      onCreated(data.debit as TreatmentDebit);
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className={uiStyles.overlay} onClick={onClose}>
      <div className={uiStyles.dialog} style={{ maxWidth: 480 }} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h3 className={uiStyles.dialogTitle} style={{ marginBottom: 14 }}>
          Novo débito
        </h3>

        <form onSubmit={handleSubmit}>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <button
              type="button"
              onClick={() => setKind("tratamento")}
              disabled={treatments.length === 0}
              className={`${styles.btn} ${kind === "tratamento" ? styles.btnPrimary : styles.btnGhost}`}
              style={{ flex: 1 }}
              title={treatments.length === 0 ? "Paciente sem tratamentos cadastrados" : undefined}
            >
              Relacionado a tratamento
            </button>
            <button
              type="button"
              onClick={() => setKind("avulso")}
              className={`${styles.btn} ${kind === "avulso" ? styles.btnPrimary : styles.btnGhost}`}
              style={{ flex: 1 }}
            >
              Avulso
            </button>
          </div>

          {kind === "tratamento" && (
            <div className={styles.field}>
              <label className={styles.label}>Tratamento*</label>
              <select className={styles.select} value={treatmentId} onChange={(e) => handleTreatmentChange(e.target.value)} required>
                <option value="">Selecione…</option>
                {treatments.map((t) => (
                  <option key={t.id} value={t.id}>
                    {treatmentLabel(t)}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className={styles.formRow}>
            <div className={styles.field}>
              <label className={styles.label}>Descrição*</label>
              <input
                type="text"
                className={styles.input}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={200}
                placeholder={kind === "avulso" ? "Ex.: Material, taxa…" : undefined}
                required
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Valor*</label>
              <input
                type="text"
                inputMode="numeric"
                className={styles.input}
                value={amount}
                onChange={(e) => setAmount(formatMoneyInput(e.target.value))}
                placeholder="0,00"
                required
              />
            </div>
          </div>

          {error && <p style={{ fontSize: 12.5, color: "var(--danger)", margin: "4px 0 0" }}>{error}</p>}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
            <button type="button" disabled={saving} onClick={onClose} className={`${styles.btn} ${styles.btnGhost}`}>
              Cancelar
            </button>
            <button type="submit" disabled={saving || !canSubmit} className={`${styles.btn} ${styles.btnPrimary}`}>
              {saving ? "Salvando…" : "Lançar débito"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
