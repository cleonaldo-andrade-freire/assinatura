"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatBRPhoneLocal, toE164BR } from "@/lib/validation";
import { PatientSearchField, type PatientSuggestion } from "@/components/PatientSearchField";
import type { ProsthesisOrder } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

export function NewProsthesisOrderForm({
  clinicId,
  onSuccess,
  bare,
}: {
  clinicId: string;
  /** Usado quando o formulário roda dentro do modal — devolve o serviço criado
   * pro chamador decidir o que fazer (fechar o modal, atualizar o board). */
  onSuccess?: (order: ProsthesisOrder) => void;
  /** Sem o cartão (`.panel`) ao redor — pro caso de já estar dentro de um modal. */
  bare?: boolean;
}) {
  const router = useRouter();

  const [patientId, setPatientId] = useState<string | null>(null);
  const [patientName, setPatientName] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [description, setDescription] = useState("");
  const [expectedDate, setExpectedDate] = useState("");

  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  const phoneDigits = patientPhone.replace(/\D/g, "");
  const phoneError = showErrors && phoneDigits.length < 10 ? "Celular inválido." : null;

  function pickSuggestion(s: PatientSuggestion) {
    setPatientId(s.id);
    setPatientName(s.name);
    setPatientPhone(s.phone ? formatBRPhoneLocal(s.phone) : "");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (phoneDigits.length < 10 || !description.trim()) {
      setShowErrors(true);
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/prosthesis-orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_id: patientId ?? undefined,
          patient_name: patientName.trim(),
          patient_phone: toE164BR(patientPhone),
          description: description.trim(),
          expected_delivery_date: expectedDate || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || data.error || "Falha ao criar o serviço.");
        return;
      }
      if (onSuccess) {
        onSuccess(data.order);
        router.refresh();
      } else {
        router.push(`/dashboard/proteses/${data.order.id}`);
        router.refresh();
      }
    } finally {
      setSending(false);
    }
  }

  const content = (
    <>
      {error && <div className="error-box">{error}</div>}

      <form onSubmit={handleSubmit} className={styles.form} style={bare ? { gap: 12 } : undefined}>
        <PatientSearchField
          clinicId={clinicId}
          name={patientName}
          onChangeName={(v) => {
            setPatientName(v);
            setPatientId(null);
          }}
          onSelect={pickSuggestion}
          hint={
            bare
              ? undefined
              : "Busca no cadastro de pacientes da clínica — se não encontrar, o serviço fica só com nome e celular, sem exigir cadastro completo agora."
          }
        />

        <div className={styles.field}>
          <label htmlFor="patientPhone" className={styles.label}>
            WhatsApp do paciente
          </label>
          <input
            id="patientPhone"
            type="text"
            inputMode="numeric"
            className={styles.input}
            value={patientPhone}
            onChange={(e) => setPatientPhone(formatBRPhoneLocal(e.target.value))}
            placeholder="(79) 99999-9999"
            required
          />
          {phoneError && <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 5 }}>{phoneError}</div>}
        </div>

        <div className={styles.field}>
          <label htmlFor="description" className={styles.label}>
            Descrição da prótese
          </label>
          <textarea
            id="description"
            className={styles.input}
            rows={bare ? 2 : 3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ex.: Prótese total superior"
            required
          />
          {showErrors && !description.trim() && (
            <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 5 }}>Descreva a prótese.</div>
          )}
        </div>

        <div className={styles.field}>
          <label htmlFor="expectedDate" className={styles.label}>
            Previsão de entrega (opcional)
          </label>
          <input
            id="expectedDate"
            type="date"
            className={styles.input}
            value={expectedDate}
            onChange={(e) => setExpectedDate(e.target.value)}
          />
        </div>

        <div className={styles.formActions}>
          <button className={`${styles.btn} ${styles.btnPrimary}`} type="submit" disabled={sending}>
            {sending ? "Criando…" : "Criar serviço"}
          </button>
        </div>
      </form>
    </>
  );

  if (bare) return content;

  return (
    <div className={styles.panel}>
      <div className={styles.panelBody}>{content}</div>
    </div>
  );
}
