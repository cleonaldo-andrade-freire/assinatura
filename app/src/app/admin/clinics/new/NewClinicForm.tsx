"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { formatCpfCnpj, isValidCpfCnpj } from "@/lib/validation";
import styles from "@/components/admin/admin.module.css";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function NewClinicForm() {
  const router = useRouter();
  const [clinicName, setClinicName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [plan, setPlan] = useState<"starter" | "pro">("starter");
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [ownerCpfCnpj, setOwnerCpfCnpj] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function handleNameChange(value: string) {
    setClinicName(value);
    if (!slugEdited) setSlug(slugify(value));
  }

  const cpfCnpjInvalid = ownerCpfCnpj.trim().length > 0 && !isValidCpfCnpj(ownerCpfCnpj);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (cpfCnpjInvalid) {
      setError("O CPF/CNPJ do responsável está inválido.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/clinics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clinicName,
          slug,
          plan,
          billingCycle,
          ownerEmail,
          ownerPassword,
          ownerCpfCnpj: ownerCpfCnpj || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || data.error || "Falha ao criar a clínica.");
        return;
      }
      router.push(`/admin/clinics/${data.clinic.id}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AdminShell title="Nova clínica" subtitle="Cria o registro, o usuário do responsável e a assinatura no Asaas de uma vez">
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
              <label htmlFor="clinicName" className={styles.label}>
                Nome da clínica
              </label>
              <input
                id="clinicName"
                type="text"
                className={styles.input}
                value={clinicName}
                onChange={(e) => handleNameChange(e.target.value)}
                required
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="slug" className={styles.label}>
                Slug
              </label>
              <input
                id="slug"
                type="text"
                className={styles.input}
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value);
                  setSlugEdited(true);
                }}
                pattern="[a-z0-9-]+"
                required
              />
            </div>

            <div className={styles.formRow}>
              <div className={styles.field}>
                <label htmlFor="plan" className={styles.label}>
                  Plano
                </label>
                <select id="plan" className={styles.select} value={plan} onChange={(e) => setPlan(e.target.value as "starter" | "pro")}>
                  <option value="starter">Starter — R$ 147/mês</option>
                  <option value="pro">Pro — R$ 297/mês</option>
                </select>
              </div>

              <div className={styles.field}>
                <label htmlFor="billingCycle" className={styles.label}>
                  Ciclo de cobrança
                </label>
                <select
                  id="billingCycle"
                  className={styles.select}
                  value={billingCycle}
                  onChange={(e) => setBillingCycle(e.target.value as "monthly" | "yearly")}
                >
                  <option value="monthly">Mensal</option>
                  <option value="yearly">Anual (10x o valor mensal)</option>
                </select>
              </div>
            </div>

            <div className={styles.field}>
              <label htmlFor="ownerEmail" className={styles.label}>
                E-mail do responsável
              </label>
              <input
                id="ownerEmail"
                type="email"
                className={styles.input}
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                required
              />
            </div>

            <div className={styles.formRow}>
              <div className={styles.field}>
                <label htmlFor="ownerPassword" className={styles.label}>
                  Senha inicial
                </label>
                <input
                  id="ownerPassword"
                  type="text"
                  className={styles.input}
                  value={ownerPassword}
                  onChange={(e) => setOwnerPassword(e.target.value)}
                  minLength={8}
                  required
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="ownerCpfCnpj" className={styles.label}>
                  CPF ou CNPJ do responsável
                </label>
                <input
                  id="ownerCpfCnpj"
                  type="text"
                  inputMode="numeric"
                  className={styles.input}
                  value={ownerCpfCnpj}
                  onChange={(e) => setOwnerCpfCnpj(formatCpfCnpj(e.target.value))}
                  placeholder="000.000.000-00 ou 00.000.000/0000-00"
                  maxLength={18}
                />
                {cpfCnpjInvalid ? (
                  <span style={{ fontSize: 12, color: "var(--danger)" }}>CPF/CNPJ inválido.</span>
                ) : (
                  <span className={styles.hint}>Opcional, ajuda no cadastro do Asaas — aceita pessoa física ou jurídica</span>
                )}
              </div>
            </div>

            <div className={styles.formActions}>
              <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={loading}>
                {loading ? "Criando…" : "Criar clínica"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </AdminShell>
  );
}
