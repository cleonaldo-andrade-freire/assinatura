"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "@/components/admin/admin.module.css";
import { PLAN_MONTHLY_PRICE } from "@/lib/asaas";
import type { Clinic } from "@/lib/database.types";

function toDateInputValue(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export function ClinicBillingAdjustments({
  clinicId,
  clinic,
}: {
  clinicId: string;
  clinic: Pick<Clinic, "subscription_status" | "trial_ends_at" | "plan" | "custom_monthly_price">;
}) {
  const router = useRouter();
  const [trialDate, setTrialDate] = useState(toDateInputValue(clinic.trial_ends_at));
  const [customPrice, setCustomPrice] = useState(
    clinic.custom_monthly_price != null ? String(clinic.custom_monthly_price) : ""
  );
  const [savingTrial, setSavingTrial] = useState(false);
  const [savingPrice, setSavingPrice] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(body: Record<string, unknown>, onDone: () => void) {
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/clinics/${clinicId}/billing`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.message || data?.error || "Falha ao salvar.");
        return;
      }
      setMessage("Salvo ✓");
      router.refresh();
    } finally {
      onDone();
    }
  }

  async function handleExtendTrial(e: React.FormEvent) {
    e.preventDefault();
    if (!trialDate) return;
    setSavingTrial(true);
    await save({ trial_ends_at: new Date(`${trialDate}T23:59:59`).toISOString() }, () => setSavingTrial(false));
  }

  async function handleSavePrice(e: React.FormEvent) {
    e.preventDefault();
    setSavingPrice(true);
    const trimmed = customPrice.trim();
    const value = trimmed ? Number(trimmed.replace(",", ".")) : null;
    await save({ custom_monthly_price: value }, () => setSavingPrice(false));
  }

  const defaultPrice = PLAN_MONTHLY_PRICE[clinic.plan];

  return (
    <div className={styles.formRow}>
      <form onSubmit={handleExtendTrial} className={styles.field}>
        <label className={styles.label} htmlFor="trial_ends_at">
          Trial até
        </label>
        <input
          id="trial_ends_at"
          type="date"
          className={styles.input}
          value={trialDate}
          onChange={(e) => setTrialDate(e.target.value)}
          disabled={clinic.subscription_status !== "trialing"}
        />
        {clinic.subscription_status !== "trialing" ? (
          <span className={styles.hint}>Só dá pra estender enquanto a clínica ainda está em trial.</span>
        ) : (
          <span className={styles.hint}>Também empurra a próxima cobrança no Asaas pra essa data.</span>
        )}
        <button
          type="submit"
          className={`${styles.btn} ${styles.btnGhost}`}
          style={{ marginTop: 8, width: "fit-content" }}
          disabled={savingTrial || clinic.subscription_status !== "trialing"}
        >
          {savingTrial ? "Salvando…" : "Estender trial"}
        </button>
      </form>

      <form onSubmit={handleSavePrice} className={styles.field}>
        <label className={styles.label} htmlFor="custom_monthly_price">
          Preço customizado (mensal)
        </label>
        <input
          id="custom_monthly_price"
          type="text"
          inputMode="decimal"
          className={styles.input}
          placeholder={`Padrão: R$ ${defaultPrice.toFixed(2).replace(".", ",")}`}
          value={customPrice}
          onChange={(e) => setCustomPrice(e.target.value)}
        />
        <span className={styles.hint}>Deixa em branco pra voltar ao preço padrão do plano.</span>
        <button
          type="submit"
          className={`${styles.btn} ${styles.btnGhost}`}
          style={{ marginTop: 8, width: "fit-content" }}
          disabled={savingPrice}
        >
          {savingPrice ? "Salvando…" : "Salvar preço"}
        </button>
      </form>

      {message && <span style={{ fontSize: 13, color: "var(--brand)" }}>{message}</span>}
      {error && <span style={{ fontSize: 13, color: "var(--danger)" }}>{error}</span>}
    </div>
  );
}
