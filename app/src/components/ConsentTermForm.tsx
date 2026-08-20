"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import type { Clinic } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

// Tiptap sozinho pesa ~130kB — carregado só quando este painel realmente
// monta (em vez de inline em Configurações, que é uma página com um monte
// de outros painéis que não precisam disso), e nunca no servidor (é
// contentEditable puro, não faz sentido em SSR).
const RichTextEditor = dynamic(() => import("@/components/ui/RichTextEditor").then((m) => m.RichTextEditor), {
  ssr: false,
  loading: () => <div className={styles.input} style={{ minHeight: 200, color: "var(--ink-faint)", fontSize: 13.5 }}>Carregando editor…</div>,
});

const DEFAULT_VERSION_PREFIX = "v";

function suggestNextVersion(current: string | null): string {
  const n = Number((current ?? "").replace(/^v/i, ""));
  return `${DEFAULT_VERSION_PREFIX}${Number.isFinite(n) && n > 0 ? n + 1 : 1}`;
}

function isHtmlEmpty(html: string): boolean {
  return html.replace(/<[^>]*>/g, "").trim().length === 0;
}

export function ConsentTermForm({ clinicId, clinic }: { clinicId: string; clinic: Clinic }) {
  const router = useRouter();
  const [text, setText] = useState(clinic.consent_term_text ?? "");
  const [version, setVersion] = useState(clinic.consent_term_version ?? suggestNextVersion(null));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const configured = !!clinic.consent_term_text?.trim() && !!clinic.consent_term_version?.trim();
  const textChanged = text.trim() !== (clinic.consent_term_text ?? "").trim();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    if (isHtmlEmpty(text)) {
      setError("Escreva o texto do termo antes de salvar.");
      return;
    }
    if (!version.trim()) {
      setError("Informe a versão do termo.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/consent-term`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent_term_text: text, consent_term_version: version.trim() }),
      });
      if (!res.ok) {
        setError("Falha ao salvar o termo.");
        return;
      }
      setSaved(true);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <p className={styles.panelHeaderTitle}>Termo de Adesão Eletrônica</p>
      </div>
      <div className={styles.panelBody}>
        <p className={styles.hint} style={{ marginBottom: 14 }}>
          Texto exibido ao paciente antes de assinar eletronicamente uma evolução clínica pelo WhatsApp. A
          redação e a responsabilidade jurídica sobre o conteúdo são da clínica — recomendamos revisão com um
          advogado. Enquanto não for configurado, o recurso de assinatura de evolução fica indisponível.
        </p>
        {!configured && (
          <div
            style={{
              background: "var(--surface-sunken)",
              borderLeft: "4px solid var(--status-warn, #b58900)",
              borderRadius: 8,
              padding: "10px 14px",
              marginBottom: 16,
              fontSize: 13.5,
            }}
          >
            Termo ainda não configurado — a solicitação de assinatura de evolução ficará bloqueada até aqui ser
            preenchido e salvo.
          </div>
        )}
        {error && <div className="error-box">{error}</div>}
        {saved && (
          <div
            style={{
              background: "var(--brand-tint)",
              color: "var(--brand-deep)",
              borderRadius: "var(--radius-sm)",
              padding: "10px 14px",
              marginBottom: 16,
              fontSize: 13.5,
            }}
          >
            Termo salvo.
          </div>
        )}
        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label}>Texto do termo</label>
            <RichTextEditor
              value={text}
              onChange={setText}
              label="Termo de Adesão Eletrônica"
              placeholder="Ex.: Ao assinar eletronicamente, o(a) paciente declara estar ciente do tratamento descrito nesta evolução clínica e concorda com o registro de sua assinatura eletrônica, nos termos da MP 2.200-2/2001 e da Lei nº 14.063/2020…"
            />
          </div>
          <div className={styles.field} style={{ maxWidth: 220 }}>
            <label htmlFor="consentVersion" className={styles.label}>
              Versão do termo
            </label>
            <input
              id="consentVersion"
              type="text"
              className={styles.input}
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="v1"
              required
            />
            {textChanged && clinic.consent_term_version && (
              <p className={styles.hint} style={{ marginTop: 4 }}>
                O texto mudou — considere avançar a versão (sugestão: {suggestNextVersion(clinic.consent_term_version)}
                ). Pacientes que já aceitaram uma versão anterior não precisam aceitar de novo automaticamente.
              </p>
            )}
          </div>
          <div className={styles.formActions}>
            <button className={`${styles.btn} ${styles.btnPrimary}`} type="submit" disabled={saving}>
              {saving ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
