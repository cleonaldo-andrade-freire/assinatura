"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatBRPhoneLocal, toE164BR } from "@/lib/validation";
import styles from "@/styles/shell.module.css";

/**
 * Cadastro manual de lead (retroativo) — pros contatos que a automação do
 * WhatsApp não pegou. A equipe pode colar a conversa que já aconteceu; ela
 * entra como a primeira mensagem do lead.
 */
export function NewLeadButton({ clinicId }: { clinicId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [conversation, setConversation] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setPhone("");
    setName("");
    setSummary("");
    setConversation("");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (phone.replace(/\D/g, "").length < 10) {
      setError("Informe um celular válido.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_phone: toE164BR(phone),
          patient_name: name.trim() || undefined,
          clinical_summary: summary.trim() || undefined,
          conversation: conversation.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.message || data?.error || "Falha ao criar o lead.");
        return;
      }
      setOpen(false);
      reset();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => setOpen(true)}>
        + Novo lead
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 16,
          }}
          onClick={() => !saving && setOpen(false)}
        >
          <div
            className={styles.panel}
            style={{ width: "100%", maxWidth: 460, maxHeight: "90vh", overflowY: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.panelHeader} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <p className={styles.panelHeaderTitle}>Novo lead</p>
              <button
                type="button"
                className={styles.iconActionBtn}
                onClick={() => !saving && setOpen(false)}
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSubmit} className={styles.panelBody} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className={styles.field}>
                <label htmlFor="lead-phone" className={styles.label}>
                  Celular (com DDD)
                </label>
                <input
                  id="lead-phone"
                  className={styles.input}
                  inputMode="numeric"
                  value={phone}
                  onChange={(e) => setPhone(formatBRPhoneLocal(e.target.value))}
                  placeholder="(79) 99999-9999"
                  autoFocus
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="lead-name" className={styles.label}>
                  Nome (opcional)
                </label>
                <input
                  id="lead-name"
                  className={styles.input}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Deixe em branco pra puxar do cadastro, se houver"
                  maxLength={120}
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="lead-summary" className={styles.label}>
                  Motivo do contato (opcional)
                </label>
                <input
                  id="lead-summary"
                  className={styles.input}
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="Ex.: dor de dente, quer orçamento de clareamento…"
                  maxLength={500}
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="lead-conversation" className={styles.label}>
                  Conversa (opcional)
                </label>
                <textarea
                  id="lead-conversation"
                  className={styles.input}
                  rows={5}
                  value={conversation}
                  onChange={(e) => setConversation(e.target.value)}
                  placeholder="Cole aqui a conversa que já aconteceu no WhatsApp — entra como a primeira mensagem, marcada como reconstituída pela equipe."
                  maxLength={20000}
                  style={{ width: "100%", resize: "vertical" }}
                />
              </div>

              {error && <p style={{ margin: 0, fontSize: 13, color: "var(--danger)" }}>{error}</p>}

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnGhost}`}
                  onClick={() => !saving && setOpen(false)}
                  disabled={saving}
                >
                  Cancelar
                </button>
                <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={saving}>
                  {saving ? "Criando…" : "Criar lead"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
