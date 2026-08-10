"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "@/components/admin/admin.module.css";
import type { PlanRecord } from "@/lib/database.types";

export function PlanForm({ plan }: { plan?: PlanRecord }) {
  const router = useRouter();
  const isEditing = !!plan;

  const [id, setId] = useState(plan?.id ?? "");
  const [name, setName] = useState(plan?.name ?? "");
  const [monthlyPrice, setMonthlyPrice] = useState(plan ? String(plan.monthly_price) : "");
  const [monthlyLimit, setMonthlyLimit] = useState(plan ? String(plan.monthly_limit) : "");
  const [overagePrice, setOveragePrice] = useState(plan ? String(plan.overage_price) : "");
  const [features, setFeatures] = useState(plan?.features.join("\n") ?? "");
  const [displayOrder, setDisplayOrder] = useState(plan ? String(plan.display_order) : "0");
  const [featured, setFeatured] = useState(plan?.featured ?? false);
  const [active, setActive] = useState(plan?.active ?? true);

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function calcSuggestedOveragePrice() {
    const price = Number(monthlyPrice.replace(",", "."));
    const limit = Number(monthlyLimit);
    if (!price || !limit) return;
    const suggested = Math.round((price / limit) * 1.15 * 100) / 100;
    setOveragePrice(String(suggested));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const body = {
        name,
        monthly_price: Number(monthlyPrice.replace(",", ".")),
        monthly_limit: Number(monthlyLimit),
        overage_price: Number(overagePrice.replace(",", ".")),
        features: features
          .split("\n")
          .map((f) => f.trim())
          .filter(Boolean),
        display_order: Number(displayOrder) || 0,
        featured,
        active,
      };

      const res = await fetch(isEditing ? `/api/admin/plans/${plan.id}` : "/api/admin/plans", {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isEditing ? body : { ...body, id }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.message || data?.error || "Falha ao salvar o plano.");
        return;
      }
      router.push("/admin/plans");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.panel}>
      <div className={styles.panelBody}>
        {error && (
          <div
            style={{
              background: "var(--danger-tint)",
              border: "1px solid #e9c6c6",
              color: "#7a2a2a",
              borderRadius: "var(--radius-sm)",
              padding: "12px 14px",
              fontSize: 14,
              marginBottom: 18,
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.formRow}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="id">
                Slug (id)
              </label>
              <input
                id="id"
                className={styles.input}
                value={id}
                onChange={(e) => setId(e.target.value)}
                pattern="[a-z0-9-]+"
                disabled={isEditing}
                required
              />
              {isEditing && <span className={styles.hint}>Não dá pra mudar o slug de um plano existente.</span>}
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="name">
                Nome exibido
              </label>
              <input id="name" className={styles.input} value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
          </div>

          <div className={styles.formRow}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="monthly_price">
                Preço mensal (R$)
              </label>
              <input
                id="monthly_price"
                type="text"
                inputMode="decimal"
                className={styles.input}
                value={monthlyPrice}
                onChange={(e) => setMonthlyPrice(e.target.value)}
                placeholder="39,90"
                required
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="monthly_limit">
                Anamneses por mês
              </label>
              <input
                id="monthly_limit"
                type="number"
                min={1}
                className={styles.input}
                value={monthlyLimit}
                onChange={(e) => setMonthlyLimit(e.target.value)}
                required
              />
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="overage_price">
              Preço da anamnese excedente (R$)
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                id="overage_price"
                type="text"
                inputMode="decimal"
                className={styles.input}
                value={overagePrice}
                onChange={(e) => setOveragePrice(e.target.value)}
                placeholder="2,29"
                required
              />
              <button
                type="button"
                onClick={calcSuggestedOveragePrice}
                className={`${styles.btn} ${styles.btnGhost}`}
                style={{ flex: "none" }}
              >
                Calcular
              </button>
            </div>
            <span className={styles.hint}>
              &quot;Calcular&quot; sugere (preço mensal ÷ limite) × 1,15 — pode ajustar manualmente depois.
            </span>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="features">
              Diferenciais (um por linha, aparece na landing)
            </label>
            <textarea
              id="features"
              className={styles.input}
              style={{ minHeight: 90, resize: "vertical", fontFamily: "inherit" }}
              value={features}
              onChange={(e) => setFeatures(e.target.value)}
              placeholder={"Perguntas personalizáveis\nSuporte prioritário"}
            />
          </div>

          <div className={styles.formRow}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="display_order">
                Ordem de exibição
              </label>
              <input
                id="display_order"
                type="number"
                className={styles.input}
                value={displayOrder}
                onChange={(e) => setDisplayOrder(e.target.value)}
              />
              <span className={styles.hint}>Menor número aparece primeiro na landing.</span>
            </div>
            <div className={styles.field}>
              <label className={styles.label} style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 26 }}>
                <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} />
                Destacar como &quot;Mais popular&quot;
              </label>
              <label className={styles.label} style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
                <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
                Ativo (aparece na landing e nos seletores)
              </label>
            </div>
          </div>

          <div className={styles.formActions}>
            <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={saving}>
              {saving ? "Salvando…" : isEditing ? "Salvar alterações" : "Criar plano"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
