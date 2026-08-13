"use client";

import { useRef, useState } from "react";
import { ToastStack, useToasts } from "@/components/ui/Toast";
import { resolveTemplate } from "@/lib/appointmentTemplates";
import { DEFAULT_STAGE_TEMPLATE_BODY, PROSTHESIS_STAGE_LABEL, PROSTHESIS_STAGES } from "@/lib/prosthesisTemplates";
import type { ProsthesisStage } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

const STAGE_VARIABLES = [
  { key: "paciente_nome", label: "Nome do paciente" },
  { key: "clinica_nome", label: "Nome da clínica" },
  { key: "descricao_protese", label: "Descrição da prótese" },
  { key: "estagio", label: "Estágio atual" },
  { key: "data_prevista", label: "Previsão de entrega" },
];

// Só pra prévia — não é dado real de nenhum paciente.
const SAMPLE_VARS: Record<string, string> = {
  paciente_nome: "Maria Silva",
  clinica_nome: "Clínica Exemplo",
  descricao_protese: "Prótese total superior",
  estagio: "Laboratório",
  data_prevista: ", previsão 20/08/2026",
};

export function ProsthesisTemplateEditor({
  clinicId,
  initialCustomized,
}: {
  clinicId: string;
  /** Modelos que a clínica já personalizou — os demais estágios usam o texto padrão. */
  initialCustomized: Partial<Record<ProsthesisStage, string>>;
}) {
  const [selectedStage, setSelectedStage] = useState<ProsthesisStage>("pre_laboratorio");
  const [bodies, setBodies] = useState<Record<ProsthesisStage, string>>(() => {
    const initial = {} as Record<ProsthesisStage, string>;
    for (const s of PROSTHESIS_STAGES) initial[s] = initialCustomized[s] ?? DEFAULT_STAGE_TEMPLATE_BODY[s];
    return initial;
  });
  const [customized, setCustomized] = useState<Record<ProsthesisStage, boolean>>(() => {
    const initial = {} as Record<ProsthesisStage, boolean>;
    for (const s of PROSTHESIS_STAGES) initial[s] = s in initialCustomized;
    return initial;
  });
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toasts, push, dismiss } = useToasts();

  const body = bodies[selectedStage];

  function setBody(next: string) {
    setBodies((prev) => ({ ...prev, [selectedStage]: next }));
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
      const res = await fetch(`/api/clinics/${clinicId}/prosthesis-stage-templates/${selectedStage}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) {
        push("Falha ao salvar o modelo.");
        return;
      }
      setCustomized((prev) => ({ ...prev, [selectedStage]: true }));
      push("Modelo salvo.", "success");
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    setSaving(true);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/prosthesis-stage-templates/${selectedStage}`, { method: "DELETE" });
      if (!res.ok) {
        push("Falha ao restaurar o padrão.");
        return;
      }
      setBody(DEFAULT_STAGE_TEMPLATE_BODY[selectedStage]);
      setCustomized((prev) => ({ ...prev, [selectedStage]: false }));
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
            <label htmlFor="stageType" className={styles.label}>
              Estágio
            </label>
            <select
              id="stageType"
              className={styles.select}
              value={selectedStage}
              onChange={(e) => setSelectedStage(e.target.value as ProsthesisStage)}
            >
              {PROSTHESIS_STAGES.map((s) => (
                <option key={s} value={s}>
                  {PROSTHESIS_STAGE_LABEL[s]}
                  {customized[s] ? " (personalizado)" : ""}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Variáveis — clique pra inserir no texto</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {STAGE_VARIABLES.map((v) => (
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
            <label htmlFor="stageTemplateBody" className={styles.label}>
              Texto da mensagem
            </label>
            <textarea
              id="stageTemplateBody"
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
            <div style={{ background: "#e8f5e2", borderRadius: "var(--radius)", padding: 16, minHeight: 180 }}>
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
          {customized[selectedStage] && (
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
