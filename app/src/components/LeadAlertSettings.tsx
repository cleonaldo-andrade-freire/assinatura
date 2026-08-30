"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatBRPhoneLocal, toE164BR } from "@/lib/validation";
import styles from "@/styles/shell.module.css";

/**
 * Liga/desliga o espelho de aviso de mensagens de lead e define o número que
 * recebe. Existe porque o app WhatsApp Business da clínica não notifica em
 * segundo plano enquanto o Evolution está vinculado como aparelho — o aviso vai
 * pra um número sem vínculo (ex.: celular pessoal do responsável).
 */
export function LeadAlertSettings({
  clinicId,
  initialEnabled,
  initialNotifyPhone,
}: {
  clinicId: string;
  initialEnabled: boolean;
  initialNotifyPhone: string | null;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [phone, setPhone] = useState(formatBRPhoneLocal(initialNotifyPhone ?? ""));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    if (enabled && phone.replace(/\D/g, "").length < 10) {
      setError("Informe o número que vai receber o aviso.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/whatsapp/number`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_alert_enabled: enabled,
          ...(enabled && phone ? { notify_phone: toE164BR(phone) } : {}),
        }),
      });
      if (!res.ok) {
        setError("Falha ao salvar. Tenta de novo.");
        return;
      }
      setSaved(true);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} style={{ marginTop: 20, borderTop: "1px solid var(--line)", paddingTop: 18 }}>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 500 }}>
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Avisar meu celular a cada mensagem de paciente
      </label>
      <p className={styles.hint} style={{ margin: "6px 0 0" }}>
        Útil quando o app da clínica não notifica em segundo plano. Manda um resumo da mensagem pro número abaixo, no
        máximo 1 a cada 15 min por conversa.
      </p>

      {enabled && (
        <div className="field" style={{ marginTop: 12, maxWidth: 320 }}>
          <label htmlFor="leadAlertPhone">Número que recebe o aviso</label>
          <div style={{ display: "flex" }}>
            <span
              style={{
                display: "flex",
                alignItems: "center",
                padding: "0 12px",
                border: "1.5px solid var(--line)",
                borderRight: "none",
                borderRadius: "var(--radius-sm) 0 0 var(--radius-sm)",
                background: "var(--surface)",
                color: "var(--ink-soft)",
              }}
            >
              🇧🇷 +55
            </span>
            <input
              id="leadAlertPhone"
              type="text"
              inputMode="numeric"
              style={{ borderRadius: "0 var(--radius-sm) var(--radius-sm) 0" }}
              value={phone}
              onChange={(e) => setPhone(formatBRPhoneLocal(e.target.value))}
              placeholder="(79) 99999-9999"
            />
          </div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14 }}>
        <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={saving}>
          {saving ? "Salvando…" : "Salvar"}
        </button>
        {saved && <span style={{ fontSize: 13, color: "var(--brand)" }}>Salvo ✓</span>}
        {error && <span style={{ fontSize: 13, color: "var(--danger)" }}>{error}</span>}
      </div>
    </form>
  );
}
