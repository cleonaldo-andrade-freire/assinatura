"use client";

import { useState } from "react";
import type { ExamRequest } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

const emptyExam: ExamRequest = { name: "", notes: "" };

/**
 * Editor da lista de exames solicitados num receituário — irmão enxuto do
 * `PrescriptionItemsEditor` (sem dosagem/controle/genérico, sem autocomplete
 * da base de medicamentos). Adição inline: um exame é só nome + observação
 * opcional, não compensa um modal.
 */
export function ExamRequestsEditor({
  exams,
  onChange,
}: {
  exams: ExamRequest[];
  onChange: (exams: ExamRequest[]) => void;
}) {
  const [draft, setDraft] = useState<ExamRequest>(emptyExam);

  function addExam() {
    if (!draft.name.trim()) return;
    onChange([...exams, { name: draft.name.trim(), notes: draft.notes?.trim() || undefined }]);
    setDraft(emptyExam);
  }

  function removeExam(index: number) {
    onChange(exams.filter((_, i) => i !== index));
  }

  return (
    <div>
      {exams.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          {exams.map((exam, index) => (
            <div
              key={index}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "8px 12px",
                background: "var(--surface-sunken)",
                border: "1px solid var(--line-soft)",
                borderRadius: "var(--radius-sm)",
                marginBottom: 8,
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 13.5, color: "var(--ink-dark)" }}>
                  {index + 1}. {exam.name}
                </div>
                {exam.notes && (
                  <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 2 }}>{exam.notes}</div>
                )}
              </div>
              <button
                type="button"
                onClick={() => removeExam(index)}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--danger)",
                  cursor: "pointer",
                  padding: "4px 8px",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                Remover
              </button>
            </div>
          ))}
        </div>
      )}

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          padding: 12,
          border: "1px dashed var(--line-soft)",
          borderRadius: "var(--radius-sm)",
        }}
      >
        <input
          type="text"
          className={styles.input}
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addExam();
            }
          }}
          placeholder="Nome do exame — ex.: Radiografia panorâmica"
        />
        <input
          type="text"
          className={styles.input}
          value={draft.notes ?? ""}
          onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addExam();
            }
          }}
          placeholder="Indicação clínica / observação (opcional)"
        />
        <button
          type="button"
          onClick={addExam}
          disabled={!draft.name.trim()}
          className={`${styles.btn} ${styles.btnGhost}`}
          style={{ justifyContent: "center" }}
        >
          + Adicionar exame
        </button>
      </div>
    </div>
  );
}
