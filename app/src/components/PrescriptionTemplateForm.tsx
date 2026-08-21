"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PRESCRIPTION_PLACEHOLDERS } from "@/lib/documentReason";
import { PrescriptionItemsEditor } from "@/components/PrescriptionItemsEditor";
import type { PrescriptionItem, PrescriptionTemplate } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

export function PrescriptionTemplateForm({
  clinicId,
  template,
}: {
  clinicId: string;
  template?: PrescriptionTemplate;
}) {
  const router = useRouter();
  const [name, setName] = useState(template?.name ?? "");
  const [items, setItems] = useState<PrescriptionItem[]>(
    template?.items?.length
      ? template.items
      : [{ drug_name: "", dosage: "", instructions: "", generic_allowed: false, control_type: "comum" }]
  );
  const [notesTemplate, setNotesTemplate] = useState(template?.notes_template ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function insertToken(token: string) {
    const el = textareaRef.current;
    if (!el) {
      setNotesTemplate((prev) => prev + token);
      return;
    }
    const start = el.selectionStart ?? notesTemplate.length;
    const end = el.selectionEnd ?? notesTemplate.length;
    const next = notesTemplate.slice(0, start) + token + notesTemplate.slice(end);
    setNotesTemplate(next);
    requestAnimationFrame(() => {
      el.focus();
      const cursor = start + token.length;
      el.setSelectionRange(cursor, cursor);
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (items.some((i) => i.control_type === "controlado_especial")) {
      setError(
        "Tem item marcado como controlado especial — este sistema não emite esse tipo de receituário. Troque o tipo de controle ou remova o item."
      );
      return;
    }
    setSaving(true);
    try {
      const url = template
        ? `/api/clinics/${clinicId}/prescription-templates/${template.id}`
        : `/api/clinics/${clinicId}/prescription-templates`;
      const res = await fetch(url, {
        method: template ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          items: items.filter((i) => i.drug_name.trim()),
          notes_template: notesTemplate.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          data.message ||
            (data.error === "controlado_especial_nao_suportado"
              ? "Tem item marcado como controlado especial — este sistema não emite esse tipo de receituário."
              : null) ||
            "Falha ao salvar o modelo."
        );
        return;
      }
      router.push("/dashboard/prescricoes/templates");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.panel}>
      <div className={styles.panelBody}>
        {error && <div className="error-box">{error}</div>}

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
              placeholder="Ex.: Pós-extração padrão"
              required
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Medicamentos padrão (opcional)</label>
            <PrescriptionItemsEditor items={items} onChange={setItems} />
          </div>

          <div className={styles.field}>
            <label htmlFor="notesTemplate" className={styles.label}>
              Orientações gerais (opcional)
            </label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
              {PRESCRIPTION_PLACEHOLDERS.map((p) => (
                <button
                  key={p.token}
                  type="button"
                  onClick={() => insertToken(p.token)}
                  className={`${styles.btn} ${styles.btnGhost}`}
                  style={{ padding: "5px 10px", fontSize: 12.5 }}
                >
                  + {p.label}
                </button>
              ))}
            </div>
            <textarea
              id="notesTemplate"
              ref={textareaRef}
              className={styles.input}
              rows={4}
              value={notesTemplate}
              onChange={(e) => setNotesTemplate(e.target.value)}
              placeholder="Ex.: {{paciente_nome}}, retornar em caso de reação adversa."
            />
            <p className={styles.hint}>
              Os placeholders acima são substituídos automaticamente pelos dados do formulário ao selecionar este
              modelo na emissão do receituário.
            </p>
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
