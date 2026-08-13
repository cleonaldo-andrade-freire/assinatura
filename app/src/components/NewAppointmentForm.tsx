"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatBRPhoneLocal, formatCPF, toE164BR } from "@/lib/validation";
import { buildDaySlotTimes } from "@/lib/appointments";
import { addMonthsToDateStr, brDateOnly, formatBRDate, formatBRTime } from "@/lib/date";
import type { Appointment } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

interface PatientSuggestion {
  id: string;
  name: string;
  cpf: string | null;
  phone: string | null;
  has_photo: boolean;
}

const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120];

type ReturnOption = "none" | "1" | "6" | "12" | "custom" | "specific";
const RETURN_OPTIONS: { value: ReturnOption; label: string }[] = [
  { value: "none", label: "Sem retorno" },
  { value: "1", label: "1 mês" },
  { value: "6", label: "6 meses" },
  { value: "12", label: "12 meses" },
  { value: "custom", label: "Outro mês" },
  { value: "specific", label: "Data específica" },
];

export function NewAppointmentForm({
  clinicId,
  professionalName,
  initialDate,
  initialTime,
  onSuccess,
  bare,
}: {
  clinicId: string;
  professionalName: string;
  initialDate: string;
  initialTime?: string;
  /** Usado quando o formulário roda dentro de um modal (ex.: duplo clique na grade
   * semanal) — no lugar de navegar pra página de detalhe, devolve o agendamento
   * criado pro chamador decidir o que fazer (fechar o modal, atualizar a lista). */
  onSuccess?: (appointment: Appointment) => void;
  /** Sem o cartão (`.panel`) ao redor — pro caso de já estar dentro de um modal, que já tem sua própria moldura. */
  bare?: boolean;
}) {
  const router = useRouter();

  const [patientId, setPatientId] = useState<string | null>(null);
  const [patientName, setPatientName] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [suggestions, setSuggestions] = useState<PatientSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState(initialTime ?? "");
  const [duration, setDuration] = useState(30);
  const [urgent, setUrgent] = useState(false);
  const [notes, setNotes] = useState("");

  const [returnOption, setReturnOption] = useState<ReturnOption>("none");
  const [returnCustomMonths, setReturnCustomMonths] = useState(2);
  const [returnSpecificDate, setReturnSpecificDate] = useState("");

  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [returnFailure, setReturnFailure] = useState<string | null>(null);
  const [createdAppointment, setCreatedAppointment] = useState<Appointment | null>(null);

  // Filtra horários que já passaram — o servidor também recusa (é a garantia
  // de verdade), isso aqui é só pra não oferecer uma opção que vai falhar.
  const slots = buildDaySlotTimes(date).filter((s) => new Date(s).getTime() > Date.now());
  const phoneDigits = patientPhone.replace(/\D/g, "");
  const phoneError = showErrors && phoneDigits.length < 10 ? "Celular inválido." : null;

  useEffect(() => {
    // Se a data mudou e o horário selecionado não existe mais na grade do
    // novo dia (não deveria acontecer, a grade é sempre a mesma janela de
    // horário — só por segurança), limpa a seleção em vez de mandar um
    // horário que não corresponde à data escolhida.
    if (time && !slots.includes(time)) setTime("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (patientName.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/clinics/${clinicId}/patients/search?q=${encodeURIComponent(patientName.trim())}`);
        if (!res.ok) return;
        const data = await res.json();
        setSuggestions(data.patients ?? []);
      } catch {
        // autocomplete é conveniência — falha silenciosa
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [patientName, clinicId]);

  function pickSuggestion(s: PatientSuggestion) {
    setPatientId(s.id);
    setPatientName(s.name);
    setPatientPhone(s.phone ? formatBRPhoneLocal(s.phone) : "");
    setShowSuggestions(false);
    setSuggestions([]);
  }

  /** A partir do horário da consulta recém-criada, calcula o `scheduled_at` do
   * retorno — mantém o mesmo horário do dia, só desloca a data (mês(es) à
   * frente ou uma data específica escolhida). `null` quando "Sem retorno". */
  function computeReturnScheduledAt(primaryIso: string): string | null {
    if (returnOption === "none") return null;
    let targetDateStr: string;
    if (returnOption === "specific") {
      if (!returnSpecificDate) return null;
      targetDateStr = returnSpecificDate;
    } else {
      const months = returnOption === "custom" ? Math.max(1, returnCustomMonths || 1) : Number(returnOption);
      targetDateStr = addMonthsToDateStr(brDateOnly(new Date(primaryIso)), months);
    }
    const [hh, mm] = formatBRTime(primaryIso).split(":");
    return new Date(`${targetDateStr}T${hh}:${mm}:00-03:00`).toISOString();
  }

  function goToCreated(appointment: Appointment) {
    if (onSuccess) {
      onSuccess(appointment);
      router.refresh();
    } else {
      router.push(`/dashboard/agenda/${appointment.id}`);
      router.refresh();
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setReturnFailure(null);
    if (!time || phoneDigits.length < 10) {
      setShowErrors(true);
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/appointments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduled_at: time,
          duration_minutes: duration,
          professional_name: professionalName,
          patient_id: patientId ?? undefined,
          patient_name: patientName.trim(),
          patient_phone: toE164BR(patientPhone),
          urgent,
          notes: notes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || data.error || "Falha ao criar o agendamento.");
        return;
      }
      const created = data.appointment as Appointment;

      const returnAt = computeReturnScheduledAt(created.scheduled_at);
      if (returnAt) {
        const resReturn = await fetch(`/api/clinics/${clinicId}/appointments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scheduled_at: returnAt,
            duration_minutes: duration,
            professional_name: professionalName,
            patient_id: patientId ?? undefined,
            patient_name: patientName.trim(),
            patient_phone: toE164BR(patientPhone),
            notes: "Retorno agendado automaticamente.",
          }),
        }).catch(() => null);
        const dataReturn = resReturn ? await resReturn.json().catch(() => null) : null;
        if (!resReturn || !resReturn.ok) {
          // A consulta principal já foi criada — não desfaz por causa do
          // retorno. Fica na tela mostrando o aviso, em vez de navegar embora
          // e o usuário nunca saber que precisa remarcar o retorno na mão.
          setCreatedAppointment(created);
          setReturnFailure(
            `Consulta criada, mas não deu pra agendar o retorno automaticamente em ${formatBRDate(returnAt)} (${dataReturn?.message || dataReturn?.error || "horário indisponível"}). Agende manualmente.`
          );
          return;
        }
      }

      goToCreated(created);
    } finally {
      setSending(false);
    }
  }

  const content = (
    <>
      {error && <div className="error-box">{error}</div>}

      {returnFailure && createdAppointment && (
        <div className="error-box" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span>{returnFailure}</span>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            style={{ alignSelf: "flex-start" }}
            onClick={() => goToCreated(createdAppointment)}
          >
            Ver consulta criada
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className={styles.form} style={bare ? { gap: 12 } : undefined}>
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
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              autoComplete="off"
              required
            />
            {showSuggestions && suggestions.length > 0 && (
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
                {suggestions.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pickSuggestion(s)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        width: "100%",
                        textAlign: "left",
                        padding: "8px 10px",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        borderRadius: 6,
                      }}
                    >
                      {s.has_photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`/api/clinics/${clinicId}/patients/${s.id}/photo`}
                          alt=""
                          style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
                        />
                      ) : (
                        <span
                          aria-hidden
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: "50%",
                            background: "var(--surface-sunken)",
                            color: "var(--ink-faint)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 15,
                            fontWeight: 700,
                            flexShrink: 0,
                          }}
                        >
                          {s.name.trim().charAt(0).toUpperCase()}
                        </span>
                      )}
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: "block", fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {s.name}
                        </span>
                        <span style={{ display: "block", fontSize: 12, color: "var(--ink-soft)" }}>
                          {s.phone ? formatBRPhoneLocal(s.phone) : s.cpf ? `CPF ${formatCPF(s.cpf)}` : "Sem contato cadastrado"}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {!bare && (
              <p className={styles.hint}>
                Busca no cadastro de pacientes da clínica — se não encontrar, o agendamento fica só com nome e
                celular, sem exigir cadastro completo agora.
              </p>
            )}
          </div>

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

          <div className={styles.formRow}>
            <div className={styles.field}>
              <label htmlFor="date" className={styles.label}>
                Data
              </label>
              <input
                id="date"
                type="date"
                className={styles.input}
                value={date}
                min={brDateOnly()}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="time" className={styles.label}>
                Horário
              </label>
              <select id="time" className={styles.select} value={time} onChange={(e) => setTime(e.target.value)} required>
                <option value="">Selecione…</option>
                {slots.map((s) => (
                  <option key={s} value={s}>
                    {formatBRTime(s)}
                  </option>
                ))}
              </select>
              {showErrors && !time && <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 5 }}>Escolha um horário.</div>}
            </div>
          </div>

          <div className={styles.formRow}>
            <div className={styles.field}>
              <label htmlFor="duration" className={styles.label}>
                Duração
              </label>
              <select
                id="duration"
                className={styles.select}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
              >
                {DURATION_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {d} minutos{d === 30 ? " (padrão)" : ""}
                  </option>
                ))}
              </select>
              {!bare && (
                <p className={styles.hint}>Ajuste conforme o tipo de tratamento — bloqueia os slots seguintes da grade.</p>
              )}
            </div>

            <div className={styles.field}>
              <label htmlFor="returnOption" className={styles.label}>
                Retornar em
              </label>
              <select
                id="returnOption"
                className={styles.select}
                value={returnOption}
                onChange={(e) => setReturnOption(e.target.value as ReturnOption)}
              >
                {RETURN_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              {returnOption === "custom" && (
                <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="number"
                    min={1}
                    max={36}
                    className={styles.input}
                    style={{ width: 90 }}
                    value={returnCustomMonths}
                    onChange={(e) => setReturnCustomMonths(Number(e.target.value))}
                  />
                  <span style={{ fontSize: 13.5, color: "var(--ink-soft)" }}>mês(es)</span>
                </div>
              )}
              {returnOption === "specific" && (
                <input
                  type="date"
                  className={styles.input}
                  style={{ marginTop: 8 }}
                  value={returnSpecificDate}
                  min={brDateOnly()}
                  onChange={(e) => setReturnSpecificDate(e.target.value)}
                  required
                />
              )}
              {!bare && returnOption !== "none" && (
                <p className={styles.hint}>Cria automaticamente uma segunda consulta no mesmo horário do dia.</p>
              )}
            </div>
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 44, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={urgent}
              onChange={(e) => setUrgent(e.target.checked)}
              style={{ width: 20, height: 20, accentColor: "var(--brand)" }}
            />
            <span style={{ fontSize: 13.5 }}>Marcar como urgência</span>
          </label>

          <div className={styles.field}>
            <label htmlFor="notes" className={styles.label}>
              Observação (opcional)
            </label>
            <textarea
              id="notes"
              className={styles.input}
              rows={bare ? 2 : 3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Motivo da consulta, anotação da recepção…"
            />
          </div>

          <div className={styles.formActions}>
            <button className={`${styles.btn} ${styles.btnPrimary}`} type="submit" disabled={sending}>
              {sending ? "Agendando…" : "Criar agendamento"}
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
