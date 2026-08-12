"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatBRPhoneLocal, toE164BR } from "@/lib/validation";
import type { QuestionTemplate } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

export function NewAnamnesisForm({ clinicId, templates }: { clinicId: string; templates: QuestionTemplate[] }) {
  const router = useRouter();
  const [patientName, setPatientName] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [billingBlocked, setBillingBlocked] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBillingBlocked(false);
    setSending(true);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_name: patientName,
          patient_phone: toE164BR(patientPhone),
          template_id: templateId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "trial_limit_reached" || data.error === "subscription_inactive") {
          setBillingBlocked(true);
          setError(
            data.message ||
              (data.error === "trial_limit_reached"
                ? "O período de teste cobre até 3 anamneses."
                : "Assinatura inativa.")
          );
        } else {
          setError(data.message || data.error || "Falha ao iniciar a anamnese.");
        }
        return;
      }
      setSent(true);
      setPatientName("");
      setPatientPhone("");
      router.refresh();
    } finally {
      setSending(false);
    }
  }

  if (templates.length === 0) {
    return (
      <div className={styles.panel}>
        <div className={styles.panelBody}>
          <p style={{ color: "var(--ink-soft)" }}>
            Você ainda não tem nenhum modelo de anamnese cadastrado.{" "}
            <a href="/dashboard/templates/new">Crie um modelo primeiro</a>.
          </p>
        </div>
      </div>
    );
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
            {error} {billingBlocked && <a href="/dashboard/configuracoes#assinatura">Ver planos e assinar →</a>}
          </div>
        )}
        {sent && (
          <div
            style={{
              background: "var(--brand-tint)",
              color: "var(--brand-deep)",
              borderRadius: "var(--radius-sm)",
              padding: "12px 14px",
              marginBottom: 18,
              fontSize: 14,
            }}
          >
            Anamnese iniciada — a primeira pergunta já foi enviada.
          </div>
        )}

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label htmlFor="patientName" className={styles.label}>
              Nome do paciente
            </label>
            <input
              id="patientName"
              type="text"
              className={styles.input}
              value={patientName}
              onChange={(e) => setPatientName(e.target.value)}
              required
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="patientPhone" className={styles.label}>
              WhatsApp do paciente
            </label>
            <div style={{ display: "flex" }}>
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "0 12px",
                  border: "1.5px solid var(--line)",
                  borderRight: "none",
                  borderRadius: "var(--radius-sm) 0 0 var(--radius-sm)",
                  background: "var(--surface-sunken)",
                  color: "var(--ink-soft)",
                }}
              >
                🇧🇷 +55
              </span>
              <input
                id="patientPhone"
                type="text"
                inputMode="numeric"
                className={styles.input}
                style={{ borderRadius: "0 var(--radius-sm) var(--radius-sm) 0" }}
                placeholder="(79) 99999-9999"
                value={patientPhone}
                onChange={(e) => setPatientPhone(formatBRPhoneLocal(e.target.value))}
                required
              />
            </div>
          </div>

          <div className={styles.field}>
            <label htmlFor="templateId" className={styles.label}>
              Modelo de anamnese
            </label>
            <select
              id="templateId"
              className={styles.select}
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              required
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.questions.length} perguntas)
                </option>
              ))}
            </select>
          </div>

          <div className={styles.formActions}>
            <button className={`${styles.btn} ${styles.btnPrimary}`} type="submit" disabled={sending}>
              {sending ? "Enviando…" : "Iniciar anamnese"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
