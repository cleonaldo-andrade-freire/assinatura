"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CERTIFICATE_PLACEHOLDERS } from "@/lib/documentReason";
import type { CertificateTemplate } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

export function CertificateTemplateForm({
  clinicId,
  template,
}: {
  clinicId: string;
  template?: CertificateTemplate;
}) {
  const router = useRouter();
  const [name, setName] = useState(template?.name ?? "");
  const [reasonTemplate, setReasonTemplate] = useState(template?.reason_template ?? "");
  const [restDaysDefault, setRestDaysDefault] = useState(
    template?.rest_days_default != null ? String(template.rest_days_default) : ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function insertToken(token: string) {
    const el = textareaRef.current;
    if (!el) {
      setReasonTemplate((prev) => prev + token);
      return;
    }
    const start = el.selectionStart ?? reasonTemplate.length;
    const end = el.selectionEnd ?? reasonTemplate.length;
    const next = reasonTemplate.slice(0, start) + token + reasonTemplate.slice(end);
    setReasonTemplate(next);
    requestAnimationFrame(() => {
      el.focus();
      const cursor = start + token.length;
      el.setSelectionRange(cursor, cursor);
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const url = template
        ? `/api/clinics/${clinicId}/certificate-templates/${template.id}`
        : `/api/clinics/${clinicId}/certificate-templates`;
      const res = await fetch(url, {
        method: template ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          reason_template: reasonTemplate.trim(),
          rest_days_default: restDaysDefault.trim() ? parseInt(restDaysDefault, 10) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || data.error || "Falha ao salvar o modelo.");
        return;
      }
      router.push("/dashboard/atestados/templates");
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
              placeholder="Ex.: Atestado padrão"
              required
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="restDaysDefault" className={styles.label}>
              Dias de afastamento padrão (opcional)
            </label>
            <input
              id="restDaysDefault"
              type="number"
              min={0}
              className={styles.input}
              style={{ maxWidth: 160 }}
              value={restDaysDefault}
              onChange={(e) => setRestDaysDefault(e.target.value)}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="reasonTemplate" className={styles.label}>
              Texto do atestado
            </label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
              {CERTIFICATE_PLACEHOLDERS.map((p) => (
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
              id="reasonTemplate"
              ref={textareaRef}
              className={styles.input}
              rows={6}
              value={reasonTemplate}
              onChange={(e) => setReasonTemplate(e.target.value)}
              placeholder="Atesto, para os devidos fins, que {{paciente_nome}} esteve sob meus cuidados odontológicos…"
              required
            />
            <p className={styles.hint}>
              Os placeholders acima são substituídos automaticamente pelos dados do formulário ao selecionar este
              modelo na emissão do atestado.
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
