"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatBRPhoneLocal, formatCPF, isValidCPF, toE164BR } from "@/lib/validation";
import { formatBRDate } from "@/lib/date";
import { resolveReasonSegments } from "@/lib/documentReason";
import type { CertificateTemplate } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

interface PatientSuggestion {
  id: string;
  name: string;
  cpf: string | null;
  phone: string | null;
}

interface CidSuggestion {
  code: string;
  description: string;
}

function todayISO(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function NewCertificateForm({ clinicId, templates }: { clinicId: string; templates: CertificateTemplate[] }) {
  const router = useRouter();

  const [patientId, setPatientId] = useState<string | null>(null);
  const [patientName, setPatientName] = useState("");
  const [patientCpf, setPatientCpf] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [patientSuggestions, setPatientSuggestions] = useState<PatientSuggestion[]>([]);
  const [showPatientSuggestions, setShowPatientSuggestions] = useState(false);

  const [cid, setCid] = useState("");
  const [cidSuggestions, setCidSuggestions] = useState<CidSuggestion[]>([]);
  const [showCidSuggestions, setShowCidSuggestions] = useState(false);
  const [hideCid, setHideCid] = useState(false);
  const [reason, setReason] = useState("");
  const [restDays, setRestDays] = useState(1);
  const [startsOn, setStartsOn] = useState(todayISO());
  const [templateId, setTemplateId] = useState("");

  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const patientDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cidDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  useEffect(() => {
    if (cidDebounceRef.current) clearTimeout(cidDebounceRef.current);
    if (cid.trim().length < 2) {
      setCidSuggestions([]);
      return;
    }
    cidDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/cid-codes/search?q=${encodeURIComponent(cid.trim())}`);
        if (!res.ok) return;
        const data = await res.json();
        setCidSuggestions(data.codes ?? []);
      } catch {
        // idem — autocomplete de CID é conveniência, não bloqueia o texto livre
      }
    }, 300);
    return () => {
      if (cidDebounceRef.current) clearTimeout(cidDebounceRef.current);
    };
  }, [cid]);

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
    // Carrega o texto do modelo com os placeholders intactos (`{{paciente_nome}}`
    // etc.) — a substituição pelos dados reais só acontece na prévia abaixo e no
    // PDF final, nunca aqui. Assim o texto nunca "engessa" com um nome/CPF que
    // ainda não tinha sido digitado no momento da seleção.
    setReason(template.reason_template);
    if (template.rest_days_default != null) setRestDays(template.rest_days_default);
  }

  const reasonPreview = reason.includes("{{")
    ? resolveReasonSegments(reason, {
        paciente_nome: patientName.trim(),
        paciente_cpf: patientCpf.trim(),
        data_emissao: formatBRDate(new Date().toISOString()),
        data_inicio: startsOn ? formatBRDate(`${startsOn}T12:00:00-03:00`) : "",
        dias_afastamento: String(restDays),
      })
    : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (cpfError) {
      setError(cpfError);
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/certificates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_name: patientName.trim(),
          patient_cpf: patientCpf.trim() || undefined,
          patient_phone: patientPhone.trim() ? toE164BR(patientPhone) : undefined,
          patient_id: patientId ?? undefined,
          cid: cid.trim() || undefined,
          hide_cid_on_patient_pdf: hideCid,
          reason: reason.trim(),
          rest_days: restDays,
          starts_on: startsOn,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || data.error || "Falha ao emitir o atestado.");
        return;
      }
      router.push(`/dashboard/atestados/${data.certificate.id}`);
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
                Modelo de atestado (opcional)
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
              automaticamente ao emitir o atestado.
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

          <div className={styles.formRow}>
            <div className={styles.field}>
              <label htmlFor="startsOn" className={styles.label}>
                Início do afastamento
              </label>
              <input
                id="startsOn"
                type="date"
                className={styles.input}
                value={startsOn}
                onChange={(e) => setStartsOn(e.target.value)}
                required
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="restDays" className={styles.label}>
                Dias de afastamento
              </label>
              <input
                id="restDays"
                type="number"
                min={0}
                className={styles.input}
                value={restDays}
                onChange={(e) => setRestDays(Math.max(0, parseInt(e.target.value, 10) || 0))}
                required
              />
            </div>
          </div>

          <div className={styles.field} style={{ position: "relative" }}>
            <label htmlFor="cid" className={styles.label}>
              CID (opcional)
            </label>
            <input
              id="cid"
              type="text"
              className={styles.input}
              value={cid}
              onChange={(e) => {
                setCid(e.target.value);
                setShowCidSuggestions(true);
              }}
              onFocus={() => setShowCidSuggestions(true)}
              onBlur={() => setTimeout(() => setShowCidSuggestions(false), 150)}
              autoComplete="off"
              placeholder="Ex.: K02.9 ou busque pela descrição"
            />
            {showCidSuggestions && cidSuggestions.length > 0 && (
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
                {cidSuggestions.map((s) => (
                  <li key={s.code}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setCid(s.code);
                        setShowCidSuggestions(false);
                        setCidSuggestions([]);
                      }}
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
                      <strong>{s.code}</strong> — {s.description}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className={styles.hint}>
              Sugestões vêm de um conjunto inicial de códigos odontológicos — o campo aceita qualquer código digitado.
            </p>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 13.5 }}>
              <input type="checkbox" checked={hideCid} onChange={(e) => setHideCid(e.target.checked)} />
              Ocultar CID no atestado do paciente (Lei nº 9.436/97) — fica salvo só no registro interno
            </label>
          </div>

          <div className={styles.field}>
            <label htmlFor="reason" className={styles.label}>
              Texto do atestado
            </label>
            <textarea
              id="reason"
              className={styles.input}
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Atesto, para os devidos fins, que o(a) paciente esteve sob meus cuidados odontológicos…"
              required
            />
            <p className={styles.hint}>
              Pode usar <code>{"{{paciente_nome}}"}</code>, <code>{"{{paciente_cpf}}"}</code>,{" "}
              <code>{"{{data_emissao}}"}</code>, <code>{"{{data_inicio}}"}</code> e{" "}
              <code>{"{{dias_afastamento}}"}</code> — esses trechos saem em <strong>negrito</strong> no PDF final.
            </p>
            {reasonPreview && (
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
                {reasonPreview.map((seg, i) =>
                  seg.variable ? <strong key={i}>{seg.text}</strong> : <span key={i}>{seg.text}</span>
                )}
              </div>
            )}
          </div>

          <div className={styles.formActions}>
            <button className={`${styles.btn} ${styles.btnPrimary}`} type="submit" disabled={sending || !!cpfError}>
              {sending ? "Emitindo…" : "Emitir atestado"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
