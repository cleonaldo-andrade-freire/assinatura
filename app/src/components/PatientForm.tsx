"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatBRPhoneLocal, formatCPF, isValidCPF, toE164BR } from "@/lib/validation";
import { PatientPhotoUpload } from "@/components/PatientPhotoUpload";
import { brDateOnly } from "@/lib/date";
import type { Patient } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

export function PatientForm({ clinicId, patient, onSuccess, isModal }: { clinicId: string; patient?: Patient, onSuccess?: () => void, isModal?: boolean }) {
  const router = useRouter();
  const [name, setName] = useState(patient?.name ?? "");
  const [cpf, setCpf] = useState(patient?.cpf ? formatCPF(patient.cpf) : "");
  const [phone, setPhone] = useState(patient?.phone ? formatBRPhoneLocal(patient.phone) : "");
  const [birthDate, setBirthDate] = useState(patient?.birth_date ?? "");
  const [notes, setNotes] = useState(patient?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cpfError = cpf.trim() && !isValidCPF(cpf) ? "CPF inválido." : null;
  const birthDateError = birthDate && birthDate > brDateOnly() ? "Data de nascimento não pode ser no futuro." : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (cpfError || birthDateError) return;
    setSaving(true);
    try {
      const url = patient
        ? `/api/clinics/${clinicId}/patients/${patient.id}`
        : `/api/clinics/${clinicId}/patients`;
      const res = await fetch(url, {
        method: patient ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          cpf: cpf.trim() || undefined,
          phone: phone.trim() ? toE164BR(phone) : undefined,
          birth_date: birthDate.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || data.error || "Falha ao salvar o paciente.");
        return;
      }
      if (onSuccess) {
        onSuccess();
      } else {
        router.push("/dashboard/pacientes");
      }
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const formContent = (
    <>
      {error && <div className="error-box">{error}</div>}

      {patient && (
        <PatientPhotoUpload clinicId={clinicId} patientId={patient.id} hasPhoto={!!patient.photo_storage_key} />
      )}

      <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label htmlFor="patientName" className={styles.label}>
              Nome completo
            </label>
            <input
              id="patientName"
              type="text"
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className={styles.formRow}>
            <div className={styles.field}>
              <label htmlFor="patientCpf" className={styles.label}>
                CPF (opcional)
              </label>
              <input
                id="patientCpf"
                type="text"
                inputMode="numeric"
                className={styles.input}
                value={cpf}
                onChange={(e) => setCpf(formatCPF(e.target.value))}
                placeholder="000.000.000-00"
                maxLength={14}
              />
              {cpfError && <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 5 }}>{cpfError}</div>}
            </div>
            <div className={styles.field}>
              <label htmlFor="patientPhone" className={styles.label}>
                WhatsApp (opcional)
              </label>
              <input
                id="patientPhone"
                type="text"
                inputMode="numeric"
                className={styles.input}
                value={phone}
                onChange={(e) => setPhone(formatBRPhoneLocal(e.target.value))}
                placeholder="(79) 99999-9999"
              />
            </div>
          </div>

          <div className={styles.field} style={{ maxWidth: 220 }}>
            <label htmlFor="patientBirthDate" className={styles.label}>
              Data de nascimento (opcional)
            </label>
            <input
              id="patientBirthDate"
              type="date"
              className={styles.input}
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              max={brDateOnly()}
            />
            {birthDateError && <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 5 }}>{birthDateError}</div>}
          </div>

          <div className={styles.field}>
            <label htmlFor="patientNotes" className={styles.label}>
              Observações (opcional)
            </label>
            <textarea
              id="patientNotes"
              className={styles.input}
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className={styles.formActions}>
            <button className={`${styles.btn} ${styles.btnPrimary}`} type="submit" disabled={saving || !!cpfError || !!birthDateError}>
              {saving ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </form>
    </>
  );

  if (isModal) {
    return formContent;
  }

  return (
    <div className={styles.panel}>
      <div className={styles.panelBody}>
        {formContent}
      </div>
    </div>
  );
}
