"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "@/components/admin/admin.module.css";
import type { Clinic } from "@/lib/database.types";
import { formatBRPhoneLocal, toE164BR } from "@/lib/validation";

type FormState = Pick<
  Clinic,
  "whatsapp_number" | "evolution_instance_name" | "evolution_base_url" | "evolution_api_key" | "notify_phone"
>;

const phonePrefixStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  padding: "0 12px",
  border: "1.5px solid var(--line)",
  borderRight: "none",
  borderRadius: "var(--radius-sm) 0 0 var(--radius-sm)",
  background: "var(--surface-sunken)",
  color: "var(--ink-soft)",
  fontSize: 14.5,
  flex: "none",
};

export function WhatsappConfigForm({ clinicId, clinic }: { clinicId: string; clinic: FormState }) {
  const router = useRouter();
  const [form, setForm] = useState({
    whatsapp_number: formatBRPhoneLocal(clinic.whatsapp_number ?? ""),
    evolution_instance_name: clinic.evolution_instance_name ?? "",
    evolution_base_url: clinic.evolution_base_url ?? "",
    evolution_api_key: clinic.evolution_api_key ?? "",
    notify_phone: formatBRPhoneLocal(clinic.notify_phone ?? ""),
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/clinics/${clinicId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          whatsapp_number: form.whatsapp_number ? toE164BR(form.whatsapp_number) : "",
          notify_phone: form.notify_phone ? toE164BR(form.notify_phone) : "",
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.message || data?.error || "Falha ao salvar.");
        return;
      }
      setSaved(true);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className={styles.form} style={{ maxWidth: "100%" }}>
      <div className={styles.formRow}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="whatsapp_number">
            Número de WhatsApp (paciente fala com esse número)
          </label>
          <div style={{ display: "flex" }}>
            <span style={phonePrefixStyle}>🇧🇷 +55</span>
            <input
              id="whatsapp_number"
              className={styles.input}
              style={{ borderRadius: "0 var(--radius-sm) var(--radius-sm) 0" }}
              inputMode="numeric"
              placeholder="(79) 99999-9999"
              value={form.whatsapp_number}
              onChange={(e) => set("whatsapp_number", formatBRPhoneLocal(e.target.value))}
            />
          </div>
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="notify_phone">
            Número pra avisar quando assinar
          </label>
          <div style={{ display: "flex" }}>
            <span style={phonePrefixStyle}>🇧🇷 +55</span>
            <input
              id="notify_phone"
              className={styles.input}
              style={{ borderRadius: "0 var(--radius-sm) var(--radius-sm) 0" }}
              inputMode="numeric"
              placeholder="(79) 99999-9999"
              value={form.notify_phone}
              onChange={(e) => set("notify_phone", formatBRPhoneLocal(e.target.value))}
            />
          </div>
          <span className={styles.hint}>Pode ser o mesmo número acima, ou outro (ex.: celular da recepção)</span>
        </div>
      </div>

      <div className={styles.formRow}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="evolution_instance_name">
            Nome da instância na Evolution API
          </label>
          <input
            id="evolution_instance_name"
            className={styles.input}
            value={form.evolution_instance_name}
            onChange={(e) => set("evolution_instance_name", e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="evolution_base_url">
            URL base da Evolution API
          </label>
          <input
            id="evolution_base_url"
            className={styles.input}
            placeholder="https://evolution.suaempresa.com"
            value={form.evolution_base_url}
            onChange={(e) => set("evolution_base_url", e.target.value)}
          />
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="evolution_api_key">
          API key da instância (Evolution API)
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            id="evolution_api_key"
            type={showApiKey ? "text" : "password"}
            className={styles.input}
            value={form.evolution_api_key}
            onChange={(e) => set("evolution_api_key", e.target.value)}
          />
          <button
            type="button"
            onClick={() => setShowApiKey((v) => !v)}
            className={`${styles.btn} ${styles.btnGhost}`}
            style={{ flex: "none" }}
          >
            {showApiKey ? "Ocultar" : "Ver"}
          </button>
        </div>
        <span className={styles.hint}>Usada só pra avisar a clínica no WhatsApp quando uma anamnese é assinada</span>
      </div>

      <div className={styles.formActions} style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={saving}>
          {saving ? "Salvando…" : "Salvar"}
        </button>
        {saved && <span style={{ fontSize: 13, color: "var(--brand)" }}>Salvo ✓</span>}
        {error && <span style={{ fontSize: 13, color: "var(--danger)" }}>{error}</span>}
      </div>
    </form>
  );
}
