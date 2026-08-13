"use client";

import { useRef, useState } from "react";
import { ToastStack, useToasts } from "@/components/ui/Toast";
import { DEFAULT_TEMPLATE_BODY, resolveTemplate, TEMPLATE_TYPE_LABEL, TEMPLATE_TYPES, TEMPLATE_VARIABLES } from "@/lib/appointmentTemplates";
import type { AppointmentMessageTemplateType } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

// Só pra prévia — não é dado real de nenhum paciente.
const SAMPLE_VARS: Record<string, string> = {
  paciente_nome: "Maria Silva",
  clinica_nome: "Clínica Exemplo",
  profissional_nome: "Dra. Exemplo",
  data_consulta: "sexta-feira, 14/08/2026",
  hora_consulta: "09:00",
  duracao_consulta: "30 min",
  status_consulta: "agendado",
  link_confirmacao: "https://seuapp.com/confirmacao/abc123",
  endereco_clinica: "Rua Exemplo, 123 — Centro",
  celular_clinica: "(79) 99999-9999",
};

export function MessageTemplateEditor({
  clinicId,
  initialCustomized,
}: {
  clinicId: string;
  /** Modelos que a clínica já personalizou — os demais tipos usam o texto padrão. */
  initialCustomized: Partial<Record<AppointmentMessageTemplateType, string>>;
}) {
  const [selectedType, setSelectedType] = useState<AppointmentMessageTemplateType>("solicitacao");
  const [bodies, setBodies] = useState<Record<AppointmentMessageTemplateType, string>>(() => {
    const initial = {} as Record<AppointmentMessageTemplateType, string>;
    for (const t of TEMPLATE_TYPES) initial[t] = initialCustomized[t] ?? DEFAULT_TEMPLATE_BODY[t];
    return initial;
  });
  const [customized, setCustomized] = useState<Record<AppointmentMessageTemplateType, boolean>>(() => {
    const initial = {} as Record<AppointmentMessageTemplateType, boolean>;
    for (const t of TEMPLATE_TYPES) initial[t] = t in initialCustomized;
    return initial;
  });
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toasts, push, dismiss } = useToasts();

  const body = bodies[selectedType];

  function setBody(next: string) {
    setBodies((prev) => ({ ...prev, [selectedType]: next }));
  }

  function insertVariable(key: string) {
    const el = textareaRef.current;
    const token = `{{${key}}}`;
    if (!el) {
      setBody(body + token);
      return;
    }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = body.slice(0, start) + token + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = start + token.length;
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/appointment-templates/${selectedType}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) {
        push("Falha ao salvar o modelo.");
        return;
      }
      setCustomized((prev) => ({ ...prev, [selectedType]: true }));
      push("Modelo salvo.", "success");
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    setSaving(true);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/appointment-templates/${selectedType}`, { method: "DELETE" });
      if (!res.ok) {
        push("Falha ao restaurar o padrão.");
        return;
      }
      setBody(DEFAULT_TEMPLATE_BODY[selectedType]);
      setCustomized((prev) => ({ ...prev, [selectedType]: false }));
      push("Voltou a usar o texto padrão.", "success");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.panel}>
      <div className={styles.panelBody}>
        <div className={styles.formRow}>
          <div className={styles.field} style={{ gridColumn: "1 / -1" }}>
            <label htmlFor="templateType" className={styles.label}>
              Momento do fluxo
            </label>
            <select
              id="templateType"
              className={styles.select}
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value as AppointmentMessageTemplateType)}
            >
              {TEMPLATE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TEMPLATE_TYPE_LABEL[t]}
                  {customized[t] ? " (personalizado)" : ""}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Variáveis — clique pra inserir no texto</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {TEMPLATE_VARIABLES.map((v) => (
              <button
                key={v.key}
                type="button"
                onClick={() => insertVariable(v.key)}
                style={{
                  background: "var(--brand-tint)",
                  color: "var(--brand-deep)",
                  border: "none",
                  borderRadius: "999px",
                  padding: "6px 12px",
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.formRow} style={{ marginTop: 14, alignItems: "flex-start" }}>
          <div className={styles.field}>
            <label htmlFor="templateBody" className={styles.label}>
              Texto da mensagem
            </label>
            <textarea
              id="templateBody"
              ref={textareaRef}
              className={styles.input}
              rows={9}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            <p className={styles.hint}>{body.length} caracteres</p>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Como o paciente vai receber</label>
            <div
              style={{
                background: "#e8f5e2",
                borderRadius: "var(--radius)",
                padding: 16,
                minHeight: 180,
              }}
            >
              <div
                style={{
                  background: "var(--surface)",
                  borderRadius: "12px 12px 12px 2px",
                  padding: "10px 12px",
                  fontSize: 13.5,
                  lineHeight: 1.5,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  boxShadow: "0 1px 2px rgba(0,0,0,.08)",
                  maxWidth: 280,
                }}
              >
                {resolveTemplate(body, SAMPLE_VARS) || <span style={{ color: "var(--ink-faint)" }}>(mensagem vazia)</span>}
              </div>
            </div>
          </div>
        </div>

        <div className={styles.formActions} style={{ display: "flex", gap: 10 }}>
          <button type="button" onClick={handleSave} disabled={saving} className={`${styles.btn} ${styles.btnPrimary}`}>
            {saving ? "Salvando…" : "Salvar modelo"}
          </button>
          {customized[selectedType] && (
            <button type="button" onClick={handleReset} disabled={saving} className={`${styles.btn} ${styles.btnGhost}`}>
              Restaurar padrão
            </button>
          )}
        </div>
      </div>

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
