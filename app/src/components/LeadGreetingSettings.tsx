"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "@/styles/shell.module.css";

/**
 * Texto da resposta automática enviada uma única vez quando um lead novo abre
 * pelo WhatsApp (número desconhecido, geralmente vindo do botão de mensagem
 * pré-preenchida do anúncio). Vazio = não responde nada, atendimento segue
 * 100% humano. Grava em `clinics.lead_bot_greeting` pela mesma rota do
 * número/aviso de WhatsApp.
 */
export function LeadGreetingSettings({
  clinicId,
  initialGreeting,
}: {
  clinicId: string;
  initialGreeting: string | null;
}) {
  const router = useRouter();
  const [greeting, setGreeting] = useState(initialGreeting ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/whatsapp/number`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_bot_greeting: greeting }),
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
      <label htmlFor="leadBotGreeting" style={{ fontSize: 14, fontWeight: 500, display: "block" }}>
        Resposta automática ao primeiro contato
      </label>
      <p className={styles.hint} style={{ margin: "6px 0 10px" }}>
        Enviada uma única vez, automaticamente, quando um número novo manda a primeira mensagem. Depois disso o
        atendimento segue pela sua equipe. Deixe em branco pra não responder nada automaticamente.
      </p>
      <textarea
        id="leadBotGreeting"
        className={styles.input}
        rows={6}
        value={greeting}
        onChange={(e) => {
          setGreeting(e.target.value);
          setSaved(false);
        }}
        maxLength={2000}
        placeholder="Ex.: Olá, tudo bem? Como posso te ajudar? Realizamos atendimentos de urgência 24h…"
        style={{ width: "100%", resize: "vertical" }}
      />

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
