"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatBRPhoneLocal, formatCPF, toE164BR } from "@/lib/validation";
import { buildDaySlotTimes } from "@/lib/appointments";
import { addMonthsToDateStr, brDateOnly, formatBRTime } from "@/lib/date";
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
  initialPatientId,
  initialPatientName,
  initialPatientPhone,
  onSuccess,
  bare,
}: {
  clinicId: string;
  professionalName: string;
  initialDate: string;
  initialTime?: string;
  /** Pré-preenche o paciente (ex.: botão "Agendar" dos painéis de Retornos/Cancelamentos
   * do dashboard) — pula a busca, já vem pronto pra escolher só data/horário. */
  initialPatientId?: string | null;
  initialPatientName?: string;
  initialPatientPhone?: string;
  /** Usado quando o formulário roda dentro de um modal (ex.: duplo clique na grade
   * semanal) — no lugar de navegar pra página de detalhe, devolve o agendamento
   * criado pro chamador decidir o que fazer (fechar o modal, atualizar a lista). */
  onSuccess?: (appointment: Appointment) => void;
  /** Sem o cartão (`.panel`) ao redor — pro caso de já estar dentro de um modal, que já tem sua própria moldura. */
  bare?: boolean;
}) {
  const router = useRouter();

  const [patientId, setPatientId] = useState<string | null>(initialPatientId ?? null);
  const [patientName, setPatientName] = useState(initialPatientName ?? "");
  const [patientPhone, setPatientPhone] = useState(initialPatientPhone ? formatBRPhoneLocal(initialPatientPhone) : "");
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

  // Filtra horários que já passaram — o servidor também recusa (é a garantia
  // de verdade), isso aqui é só pra não oferecer uma opção nova que vai
  // falhar. Mas se o horário atual pertence mesmo à data escolhida (ex.:
  // pré-preenchido ao clicar num slot vago da agenda, só que mais cedo hoje)
  // e só não está na lista por já ter passado, ele continua entrando como
  // opção — senão o <select> mostra em branco mesmo com o valor certo por
  // baixo, e a mensagem de erro do servidor ("já passou") fica mais clara
  // que um campo que parece nunca ter sido preenchido. Se a data mudou de
  // verdade, `time` não pertence mais aos slots dessa data e o efeito
  // abaixo limpa a seleção normalmente.
  const allSlotsForDate = buildDaySlotTimes(date);
  const futureSlots = allSlotsForDate.filter((s) => new Date(s).getTime() > Date.now());
  const slots = time && allSlotsForDate.includes(time) && !futureSlots.includes(time) ? [time, ...futureSlots].sort() : futureSlots;
  const phoneDigits = patientPhone.replace(/\D/g, "");
  const phoneError = showErrors && phoneDigits.length < 10 ? "Celular inválido." : null;

  const isFirstDateRender = useRef(true);
  useEffect(() => {
    // Só entra em ação numa troca de data DEPOIS do mount — como o efeito
    // roda uma vez ao montar mesmo sem a data ter "mudado" de verdade, sem
    // essa guarda ele apagava o horário pré-preenchido (initialTime, vindo
    // do clique num slot vago da agenda) sempre que esse horário já tivesse
    // passado em relação a agora — o que é o caso da maioria dos horários
    // de hoje à noite. Numa troca de data real (usuário mexeu no seletor),
    // aí sim limpa se o horário escolhido não existir mais na grade do novo dia.
    if (isFirstDateRender.current) {
      isFirstDateRender.current = false;
      return;
    }
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

  // Sugere a observação a partir dos tratamentos em aberto do paciente — só
  // preenche se o campo ainda estiver vazio (nunca sobrescreve o que a
  // dentista já digitou). Ajuda a lembrar do que se trata o agendamento sem
  // precisar abrir a ficha do paciente antes.
  useEffect(() => {
    if (!patientId) return;
    let cancelled = false;
    fetch(`/api/clinics/${clinicId}/patients/${patientId}/treatments`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { treatments?: { treatment_name: string; tooth_region: string | null }[] } | null) => {
        if (cancelled || !data?.treatments?.length) return;
        setNotes((prev) => {
          if (prev.trim()) return prev;
          const names = data.treatments!.map((t) => (t.tooth_region ? `${t.tooth_region} — ${t.treatment_name}` : t.treatment_name));
          return `Tratamentos em aberto: ${names.join(", ")}`;
        });
      })
      .catch(() => {
        // sugestão é conveniência — falha silenciosa
      });
    return () => {
      cancelled = true;
    };
  }, [patientId, clinicId]);

  /** Data prevista de retorno (só a data, sem horário) a partir da opção
   * escolhida — relativa à data desta consulta, não a hoje. Não cria
   * nenhuma consulta sozinha: é só um sinal pra "Retornos próximos" avisar
   * a recepção quando estiver perto, pra ela chamar o paciente e combinar
   * o horário de verdade. `null` quando "Sem retorno". */
  function computeReturnDueDate(): string | null {
    if (returnOption === "none") return null;
    if (returnOption === "specific") return returnSpecificDate || null;
    const months = returnOption === "custom" ? Math.max(1, returnCustomMonths || 1) : Number(returnOption);
    return addMonthsToDateStr(date, months);
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
          return_due_date: computeReturnDueDate() ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || data.error || "Falha ao criar o agendamento.");
        return;
      }
      goToCreated(data.appointment as Appointment);
    } finally {
      setSending(false);
    }
  }

  const alerts = <>{error && <div className="error-box">{error}</div>}</>;

  const submitButton = (
    <button
      className={`${styles.btn} ${styles.btnPrimary}`}
      type="submit"
      disabled={sending}
      style={{ width: "100%", justifyContent: "center" }}
    >
      {sending ? "Agendando…" : "Criar agendamento"}
    </button>
  );

  const fieldGroups = (
    <>
        <div className={styles.fgroup}>
          <p className={styles.fgroupLabel}>Paciente</p>
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

          {(!showSuggestions && !patientId && patientName.trim().length > 0) && (
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
          )}
        </div>

        <div className={styles.fgroup}>
          <p className={styles.fgroupLabel}>Agendamento</p>
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
                <p className={styles.hint}>
                  Não agenda sozinho — só avisa a recepção em &quot;Retornos próximos&quot; quando estiver perto, pra
                  combinar o horário com o paciente.
                </p>
              )}
            </div>
          </div>

          <div className={styles.formRow} style={{ alignItems: "flex-start" }}>
            <div className={styles.field} style={{ flex: 1 }}>
              <label htmlFor="notes" className={styles.label}>
                Observação (opcional)
              </label>
              <input
                id="notes"
                type="text"
                className={styles.input}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Motivo da consulta…"
              />
            </div>
            
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 32, cursor: "pointer", flexShrink: 0 }}>
              <input
                type="checkbox"
                checked={urgent}
                onChange={(e) => setUrgent(e.target.checked)}
                style={{ width: 18, height: 18, accentColor: "var(--brand)" }}
              />
              <span style={{ fontSize: 13.5, fontWeight: 500 }}>Urgência</span>
            </label>
          </div>
        </div>
    </>
  );

  if (bare) {
    return (
      <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div style={{ flexShrink: 0 }}>{alerts}</div>
        <form
          onSubmit={handleSubmit}
          className={styles.form}
          style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 0 }}
        >
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 14,
              paddingRight: 6,
              paddingBottom: 2,
            }}
          >
            {fieldGroups}
          </div>
          <div style={{ flexShrink: 0, paddingTop: 14, marginTop: 10 }}>
            {submitButton}
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <div className={styles.panelBody}>
        {alerts}
        <form onSubmit={handleSubmit} className={styles.form}>
          {fieldGroups}
          <div className={styles.formActions}>{submitButton}</div>
        </form>
      </div>
    </div>
  );
}
