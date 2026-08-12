"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatBRPhoneLocal, formatCPF, isValidCPF, toE164BR } from "@/lib/validation";
import { formatBRDate } from "@/lib/date";
import { resolveReasonSegments } from "@/lib/documentReason";
import { PrescriptionItemsEditor } from "@/components/PrescriptionItemsEditor";
import type { PrescriptionItem, PrescriptionTemplate } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

interface PatientSuggestion {
  id: string;
  name: string;
  cpf: string | null;
  phone: string | null;
}

const ERROR_MESSAGES: Record<string, string> = {
  controlado_especial_nao_suportado:
    "Tem item marcado como controlado especial — este sistema não emite esse tipo de prescrição.",
  dentist_not_configured: "Cadastre o responsável técnico em Configurações antes de emitir.",
};

export function NewPrescriptionForm({
  clinicId,
  templates,
}: {
  clinicId: string;
  templates: PrescriptionTemplate[];
}) {
  const router = useRouter();

  const [patientId, setPatientId] = useState<string | null>(null);
  const [patientName, setPatientName] = useState("");
  const [patientCpf, setPatientCpf] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [patientSuggestions, setPatientSuggestions] = useState<PatientSuggestion[]>([]);
  const [showPatientSuggestions, setShowPatientSuggestions] = useState(false);

  const [items, setItems] = useState<PrescriptionItem[]>([
    { drug_name: "", dosage: "", instructions: "", generic_allowed: false, control_type: "comum" },
  ]);
  const [notes, setNotes] = useState("");
  const [templateId, setTemplateId] = useState("");

  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const patientDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cpfError = patientCpf.trim() && !isValidCPF(patientCpf) ? "CPF inválido." : null;

  useEffect(() => {
    if (patientDebounceRef.current) clearTimeout(patientDebounceRef.current);
    if (patientName.trim().length < 2) {
      setPatientSuggestions([]);
      return;
    }
    patientDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/clinics/${clinicId}/patients/search?q=${encodeURIComponent(patientName.trim())}`);
        if (!res.ok) return;
        const data = await res.json();
        setPatientSuggestions(data.patients ?? []);
      } catch {
        // busca de sugestão é conveniência — falha silenciosa não trava o formulário
      }
    }, 300);
    return () => {
      if (patientDebounceRef.current) clearTimeout(patientDebounceRef.current);
    };
  }, [patientName, clinicId]);

  function pickPatientSuggestion(s: PatientSuggestion) {
    setPatientId(s.id);
    setPatientName(s.name);
    setPatientCpf(s.cpf ? formatCPF(s.cpf) : "");
    setPatientPhone(s.phone ? formatBRPhoneLocal(s.phone) : "");
    setShowPatientSuggestions(false);
    setPatientSuggestions([]);
  }

  function handleSelectTemplate(id: string) {
    setTemplateId(id);
    const template = templates.find((t) => t.id === id);
    if (!template) return;
    // Carrega os itens e o texto do modelo com os placeholders intactos — a
    // substituição pelos dados reais só acontece na prévia abaixo e no PDF
    // final, mesma correção que já vale pro atestado.
    if (template.items.length > 0) {
      setItems(template.items.map((i) => ({ ...i })));
    }
    setNotes(template.notes_template ?? "");
  }

  const notesPreview = notes.includes("{{")
    ? resolveReasonSegments(notes, {
        paciente_nome: patientName.trim(),
        paciente_cpf: patientCpf.trim(),
        data_emissao: formatBRDate(new Date().toISOString()),
      })
    : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (cpfError) {
      setError(cpfError);
      return;
    }
    if (items.some((i) => i.control_type === "controlado_especial")) {
      setError(
        "Tem item marcado como controlado especial — este sistema não emite esse tipo de prescrição. Troque o tipo de controle ou remova o item."
      );
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/prescriptions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_name: patientName.trim(),
          patient_cpf: patientCpf.trim() || undefined,
          patient_phone: patientPhone.trim() ? toE164BR(patientPhone) : undefined,
          patient_id: patientId ?? undefined,
          items: items
            .filter((i) => i.drug_name.trim())
            .map((i) => ({ ...i, dosage: i.dosage.trim(), instructions: i.instructions.trim() })),
          notes: notes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || ERROR_MESSAGES[data.error] || "Falha ao emitir a prescrição.");
        return;
      }
      router.push(`/dashboard/prescricoes/${data.prescription.id}`);
      router.refresh();
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={styles.panel}>
      <div className={styles.panelBody}>
        {error && <div className="error-box">{error}</div>}

        <form onSubmit={handleSubmit} className={styles.form}>
          {templates.length > 0 && (
            <div className={styles.field}>
              <label htmlFor="templateId" className={styles.label}>
                Modelo de prescrição (opcional)
              </label>
              <select
                id="templateId"
                className={styles.select}
                value={templateId}
                onChange={(e) => handleSelectTemplate(e.target.value)}
              >
                <option value="">Escrever do zero</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className={styles.field} style={{ position: "relative" }}>
            <label htmlFor="patientName" className={styles.label}>
              Nome do paciente
            </label>
            <input
              id="patientName"
              type="text"
              className={styles.input}
              value={patientName}
              onChange={(e) => {
                setPatientName(e.target.value);
                setPatientId(null);
                setShowPatientSuggestions(true);
              }}
              onFocus={() => setShowPatientSuggestions(true)}
              onBlur={() => setTimeout(() => setShowPatientSuggestions(false), 150)}
              autoComplete="off"
              required
            />
            {showPatientSuggestions && patientSuggestions.length > 0 && (
              <ul
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  right: 0,
                  zIndex: 5,
                  margin: "4px 0 0",
                  padding: 4,
                  listStyle: "none",
                  background: "var(--surface)",
                  border: "1.5px solid var(--line)",
                  borderRadius: "var(--radius-sm)",
                  boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
                  maxHeight: 220,
                  overflowY: "auto",
                }}
              >
                {patientSuggestions.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pickPatientSuggestion(s)}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        padding: "8px 10px",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        borderRadius: 6,
                        fontSize: 13.5,
                      }}
                    >
                      {s.name}
                      {s.cpf && <span style={{ color: "var(--ink-soft)" }}> — CPF {formatCPF(s.cpf)}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className={styles.hint}>
              Busca no cadastro de pacientes da clínica — se não encontrar, um cadastro novo é criado
              automaticamente ao emitir a prescrição.
            </p>
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
                value={patientCpf}
                onChange={(e) => setPatientCpf(formatCPF(e.target.value))}
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
                value={patientPhone}
                onChange={(e) => setPatientPhone(formatBRPhoneLocal(e.target.value))}
                placeholder="(79) 99999-9999"
              />
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Medicamentos</label>
            <PrescriptionItemsEditor items={items} onChange={setItems} />
          </div>

          <div className={styles.field}>
            <label htmlFor="notes" className={styles.label}>
              Orientações gerais (opcional)
            </label>
            <textarea
              id="notes"
              className={styles.input}
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex.: retornar em caso de reação adversa…"
            />
            <p className={styles.hint}>
              Pode usar <code>{"{{paciente_nome}}"}</code>, <code>{"{{paciente_cpf}}"}</code> e{" "}
              <code>{"{{data_emissao}}"}</code> — esses trechos saem em <strong>negrito</strong> no PDF final.
            </p>
            {notesPreview && (
              <div
                style={{
                  marginTop: 10,
                  padding: "10px 12px",
                  background: "var(--surface-sunken)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: 13.5,
                }}
              >
                <p style={{ margin: "0 0 6px", fontSize: 11.5, fontWeight: 700, color: "var(--ink-soft)", textTransform: "uppercase" }}>
                  Prévia
                </p>
                {notesPreview.map((seg, i) =>
                  seg.variable ? <strong key={i}>{seg.text}</strong> : <span key={i}>{seg.text}</span>
                )}
              </div>
            )}
          </div>

          <div className={styles.formActions}>
            <button className={`${styles.btn} ${styles.btnPrimary}`} type="submit" disabled={sending || !!cpfError}>
              {sending ? "Emitindo…" : "Emitir prescrição"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
