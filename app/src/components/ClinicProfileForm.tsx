"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatBRPhoneLocal, formatCNPJ, formatCPF, toE164BR } from "@/lib/validation";
import type { Clinic } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

export function ClinicProfileForm({ clinicId, clinic }: { clinicId: string; clinic: Clinic }) {
  const router = useRouter();
  const [name, setName] = useState(clinic.dentist_name ?? "");
  const [cro, setCro] = useState(clinic.dentist_cro ?? "");
  const [croUf, setCroUf] = useState(clinic.dentist_cro_uf ?? "");
  const [cpf, setCpf] = useState(clinic.dentist_cpf ? formatCPF(clinic.dentist_cpf) : "");
  const [phone, setPhone] = useState(clinic.dentist_phone ? formatBRPhoneLocal(clinic.dentist_phone) : "");
  const [email, setEmail] = useState(clinic.dentist_email ?? "");
  const [address, setAddress] = useState(clinic.clinic_address ?? "");
  const [cnpj, setCnpj] = useState(clinic.cnpj ? formatCNPJ(clinic.cnpj) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dentist_name: name.trim(),
          dentist_cro: cro.trim(),
          dentist_cro_uf: croUf.trim(),
          dentist_cpf: cpf.trim() ? cpf.replace(/\D/g, "") : undefined,
          dentist_phone: phone.trim() ? toE164BR(phone) : undefined,
          dentist_email: email.trim() || undefined,
          clinic_address: address.trim() || undefined,
          cnpj: cnpj.trim() ? cnpj.toUpperCase().replace(/[^A-Z0-9]/g, "") : undefined,
        }),
      });
      if (!res.ok) {
        setError("Falha ao salvar os dados do perfil.");
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
        <p className={styles.panelHeaderTitle}>Responsável técnico</p>
      </div>
      <div className={styles.panelBody}>
        <p className={styles.hint} style={{ marginBottom: 14 }}>
          Usado pra assinar os atestados emitidos por esta clínica e nos dados do documento entregue ao paciente.
        </p>
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
            Dados salvos.
          </div>
        )}
        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label htmlFor="dentistName" className={styles.label}>
              Nome completo do dentista
            </label>
            <input
              id="dentistName"
              type="text"
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className={styles.formRow}>
            <div className={styles.field}>
              <label htmlFor="dentistCro" className={styles.label}>
                CRO
              </label>
              <input
                id="dentistCro"
                type="text"
                className={styles.input}
                value={cro}
                onChange={(e) => setCro(e.target.value)}
                placeholder="12345"
                required
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="dentistCroUf" className={styles.label}>
                UF do CRO
              </label>
              <input
                id="dentistCroUf"
                type="text"
                className={styles.input}
                value={croUf}
                onChange={(e) => setCroUf(e.target.value.toUpperCase().slice(0, 2))}
                placeholder="SE"
                maxLength={2}
                required
              />
            </div>
          </div>
          <div className={styles.field}>
            <label htmlFor="dentistCpf" className={styles.label}>
              CPF (titular do certificado digital)
            </label>
            <input
              id="dentistCpf"
              type="text"
              inputMode="numeric"
              className={styles.input}
              value={cpf}
              onChange={(e) => setCpf(formatCPF(e.target.value))}
              placeholder="000.000.000-00"
              maxLength={14}
            />
            <p className={styles.hint} style={{ marginTop: 4 }}>
              Precisa bater com o CPF do certificado A3 usado pra assinar os documentos (Certisign).
            </p>
          </div>
          <div className={styles.formRow}>
            <div className={styles.field}>
              <label htmlFor="dentistPhone" className={styles.label}>
                Celular (opcional)
              </label>
              <input
                id="dentistPhone"
                type="text"
                inputMode="numeric"
                className={styles.input}
                value={phone}
                onChange={(e) => setPhone(formatBRPhoneLocal(e.target.value))}
                placeholder="(79) 99999-9999"
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="dentistEmail" className={styles.label}>
                E-mail (opcional)
              </label>
              <input
                id="dentistEmail"
                type="email"
                className={styles.input}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="contato@clinica.com"
              />
            </div>
          </div>
          <div className={styles.formRow}>
            <div className={styles.field}>
              <label htmlFor="clinicAddress" className={styles.label}>
                Endereço de atendimento (opcional)
              </label>
              <textarea
                id="clinicAddress"
                className={styles.input}
                rows={2}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Rua, número, bairro, cidade — UF"
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="clinicCnpj" className={styles.label}>
                CNPJ da clínica (opcional)
              </label>
              <input
                id="clinicCnpj"
                type="text"
                className={styles.input}
                value={cnpj}
                onChange={(e) => setCnpj(formatCNPJ(e.target.value))}
                placeholder="00.000.000/0000-00"
                maxLength={18}
              />
              <p className={styles.hint} style={{ marginTop: 4 }}>
                Aparece no cabeçalho dos documentos gerados quando preenchido. Aceita o novo CNPJ alfanumérico (com
                letras nas 12 primeiras posições).
              </p>
            </div>
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
