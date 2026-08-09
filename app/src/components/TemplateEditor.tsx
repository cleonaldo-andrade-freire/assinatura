"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Question, QuestionType } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

function newQuestionId(): string {
  return `q${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

interface TemplateEditorProps {
  clinicId: string;
  templateId?: string;
  initialName?: string;
  initialQuestions?: Question[];
}

export function TemplateEditor({ clinicId, templateId, initialName, initialQuestions }: TemplateEditorProps) {
  const router = useRouter();
  const [name, setName] = useState(initialName ?? "");
  const [questions, setQuestions] = useState<Question[]>(
    initialQuestions && initialQuestions.length > 0
      ? initialQuestions
      : [{ id: newQuestionId(), text: "", type: "text" }]
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function updateQuestion(index: number, patch: Partial<Question>) {
    setQuestions((qs) => qs.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  }

  function addQuestion() {
    setQuestions((qs) => [...qs, { id: newQuestionId(), text: "", type: "text" }]);
  }

  function removeQuestion(index: number) {
    setQuestions((qs) => qs.filter((_, i) => i !== index));
  }

  function moveQuestion(index: number, dir: -1 | 1) {
    setQuestions((qs) => {
      const target = index + dir;
      if (target < 0 || target >= qs.length) return qs;
      const copy = [...qs];
      [copy[index], copy[target]] = [copy[target], copy[index]];
      return copy;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const cleanQuestions = questions.map((q) => ({ ...q, text: q.text.trim() })).filter((q) => q.text.length > 0);
    if (cleanQuestions.length === 0) {
      setError("Adicione pelo menos uma pergunta com texto.");
      return;
    }

    setSaving(true);
    try {
      const url = templateId
        ? `/api/clinics/${clinicId}/templates/${templateId}`
        : `/api/clinics/${clinicId}/templates`;
      const res = await fetch(url, {
        method: templateId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, questions: cleanQuestions }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || data.error || "Falha ao salvar o modelo.");
        return;
      }
      router.push("/dashboard/templates");
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
          <div className={styles.field}>
            <label htmlFor="templateName" className={styles.label}>
              Nome do modelo
            </label>
            <input
              id="templateName"
              type="text"
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder='Ex.: "Adulto", "Criança", "Simples"'
              required
            />
          </div>

          <div>
            <label className={styles.label} style={{ display: "block", marginBottom: 8 }}>
              Perguntas
            </label>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {questions.map((q, i) => (
                <div
                  key={q.id}
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "flex-start",
                    background: "var(--surface-sunken)",
                    border: "1px solid var(--line)",
                    borderRadius: "var(--radius-sm)",
                    padding: 10,
                  }}
                >
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                    <input
                      type="text"
                      className={styles.input}
                      placeholder={`Pergunta ${i + 1}`}
                      value={q.text}
                      onChange={(e) => updateQuestion(i, { text: e.target.value })}
                    />
                    <select
                      className={styles.select}
                      value={q.type}
                      onChange={(e) => updateQuestion(i, { type: e.target.value as QuestionType })}
                      style={{ fontSize: 13.5 }}
                    >
                      <option value="text">Resposta livre</option>
                      <option value="yesno">Sim / Não</option>
                    </select>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <button
                      type="button"
                      onClick={() => moveQuestion(i, -1)}
                      disabled={i === 0}
                      title="Mover pra cima"
                      className={`${styles.btn} ${styles.btnGhost}`}
                      style={{ padding: "4px 8px" }}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveQuestion(i, 1)}
                      disabled={i === questions.length - 1}
                      title="Mover pra baixo"
                      className={`${styles.btn} ${styles.btnGhost}`}
                      style={{ padding: "4px 8px" }}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => removeQuestion(i)}
                      title="Remover"
                      className={`${styles.btn} ${styles.btnGhost}`}
                      style={{ padding: "4px 8px", color: "var(--danger)" }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button type="button" onClick={addQuestion} className={`${styles.btn} ${styles.btnGhost}`} style={{ marginTop: 12 }}>
              + Adicionar pergunta
            </button>
          </div>

          <div className={styles.formActions}>
            <button className={`${styles.btn} ${styles.btnPrimary}`} type="submit" disabled={saving}>
              {saving ? "Salvando…" : "Salvar modelo"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
