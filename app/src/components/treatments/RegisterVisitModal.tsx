"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { DictationButton } from "@/components/treatments/DictationButton";
import { EvolutionImageUploader, type EvolutionImageItem } from "@/components/treatments/EvolutionImageUploader";
import { NewTreatmentModal } from "@/components/treatments/NewTreatmentModal";
import { ToastStack, useToasts } from "@/components/ui/Toast";
import { brDateOnly } from "@/lib/date";
import { formatMoneyDisplay } from "@/lib/money";
import { PAYMENT_METHODS } from "@/lib/paymentMethods";
import { buildVisitText } from "@/lib/treatments";
import { appendDictated, useDictation } from "@/lib/useDictation";
import { useEscapeToClose } from "@/lib/useEscapeToClose";
import type { Treatment, TreatmentDebit } from "@/lib/database.types";
import uiStyles from "@/components/ui/ui.module.css";
import styles from "@/styles/shell.module.css";
import tp from "./treatments.module.css";

const DEFAULT_PAYMENT_METHOD = "Pix";
// Mesmo limite do servidor (MAX_EVOLUTION_IMAGES em treatmentEvolutionStorage
// — não importado daqui porque aquele módulo é só de servidor).
const MAX_IMAGES = 5;

type Step = 0 | 1 | 2;
const STEPS: { label: string }[] = [{ label: "1. Tratamentos" }, { label: "2. Evolução" }, { label: "3. Pagamento" }];

function formatMoney(value: number): string {
  return `R$ ${formatMoneyDisplay(value)}`;
}

/**
 * "Registrar atendimento" — atalho pro caso mais comum da clínica numa
 * tela só, dividida em etapas (abas + Voltar/Avançar): escolher os
 * tratamentos da sessão, escrever UMA evolução (com ditado e fotos) e
 * receber UM pagamento (Pix por padrão). Etapas e não abas soltas porque
 * uma depende da outra (o texto e o valor saem dos tratamentos marcados) —
 * o Salvar só aparece na última, pra ninguém salvar sem ver o pagamento.
 * Pagamento parcial não entra aqui de propósito — continua na aba Débitos,
 * que já tem a regra de divisão.
 *
 * Com `appointmentId` (veio do "Iniciar atendimento" da agenda), o
 * agendamento vira "atendido" ao salvar.
 */
export function RegisterVisitModal({
  open,
  onClose,
  clinicId,
  patientId,
  appointmentId,
  initialSelectedIds,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  clinicId: string;
  patientId: string;
  appointmentId?: string | null;
  /** Tratamentos já marcados na lista do painel — entram pré-selecionados. */
  initialSelectedIds: string[];
  onSaved: (message: string) => void;
}) {
  const { toasts, push, dismiss } = useToasts();

  const [step, setStep] = useState<Step>(0);
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [debits, setDebits] = useState<TreatmentDebit[]>([]);
  const [loading, setLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [newTreatmentOpen, setNewTreatmentOpen] = useState(false);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [finalize, setFinalize] = useState(true);
  const [evolutionDate, setEvolutionDate] = useState(brDateOnly());
  const [text, setText] = useState("");
  // Enquanto o texto não foi mexido, ele acompanha os tratamentos marcados;
  // depois de editado (ou ditado), não sobrescreve mais.
  const [textTouched, setTextTouched] = useState(false);
  const [images, setImages] = useState<EvolutionImageItem[]>([]);
  // Desmarcada por padrão — envio ao paciente só por escolha explícita
  // (evita mensagens automáticas, risco de bloqueio do WhatsApp da clínica).
  const [notifyPatient, setNotifyPatient] = useState(false);
  const [receiveNow, setReceiveNow] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState(DEFAULT_PAYMENT_METHOD);
  const [saving, setSaving] = useState(false);

  const dictation = useDictation((dictated) => {
    setTextTouched(true);
    setText((prev) => appendDictated(prev, dictated));
  });

  useEscapeToClose(onClose, open && !newTreatmentOpen);

  useEffect(() => {
    dictation.stop();
    if (!open) return;
    setStep(0);
    setSelected(new Set(initialSelectedIds));
    setFinalize(true);
    setEvolutionDate(brDateOnly());
    setText("");
    setTextTouched(false);
    setImages([]);
    setNotifyPatient(false);
    setReceiveNow(true);
    setPaymentMethod(DEFAULT_PAYMENT_METHOD);
    setReloadKey((k) => k + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || reloadKey === 0) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/clinics/${clinicId}/patients/${patientId}/atendimento`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        if (cancelled) return;
        const loaded = (data.treatments ?? []) as Treatment[];
        setTreatments(loaded);
        setDebits(data.debits ?? []);
        // Um tratamento só em aberto e nada marcado: é ele.
        setSelected((prev) => (prev.size === 0 && loaded.length === 1 ? new Set([loaded[0].id]) : prev));
      })
      .catch(() => !cancelled && push("Falha ao carregar os tratamentos do paciente."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  const selectedTreatments = treatments.filter((t) => selected.has(t.id));
  const selectedDebits = debits.filter((d) => d.treatment_id && selected.has(d.treatment_id));
  const total = selectedDebits.reduce((sum, d) => sum + d.amount, 0);

  useEffect(() => {
    if (!textTouched) setText(buildVisitText(selectedTreatments, finalize));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, finalize, treatments, textTouched]);

  if (!open || typeof document === "undefined") return null;

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const willReceive = receiveNow && total > 0;
  // Cada etapa só libera a seguinte quando está completa.
  const stepValid = [selected.size > 0, text.trim().length > 0 && !!evolutionDate, !willReceive || !!paymentMethod];
  const canReach = (target: Step) => stepValid.slice(0, target).every(Boolean);
  const canSave = stepValid.every(Boolean);

  function goTo(target: Step) {
    if (target === step || !canReach(target)) return;
    dictation.stop();
    setStep(target);
  }

  async function handleSave() {
    dictation.stop();
    if (!canSave) return;
    setSaving(true);
    try {
      const form = new FormData();
      form.set(
        "payload",
        JSON.stringify({
          treatment_ids: Array.from(selected),
          evolution_date: evolutionDate,
          evolution_text: text.trim(),
          finalize,
          notify_patient: notifyPatient,
          payment_method: willReceive ? paymentMethod : null,
          appointment_id: appointmentId ?? null,
        })
      );
      images.forEach((item) => {
        form.append("images", item.file);
        form.append("new_image_descriptions", item.description);
      });
      const res = await fetch(`/api/clinics/${clinicId}/patients/${patientId}/atendimento`, { method: "POST", body: form });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        push(data?.message ? `Não foi possível salvar: ${data.message}` : "Falha ao salvar o atendimento. Nada foi gravado — tenta de novo.");
        if (res.status === 409) {
          setReloadKey((k) => k + 1);
          setStep(0);
        }
        return;
      }
      const parts = [
        "Atendimento registrado",
        finalize ? "tratamentos finalizados" : null,
        willReceive ? `${formatMoney(total)} recebido via ${paymentMethod}` : null,
        data?.appointment_id ? "agendamento marcado como atendido" : null,
      ];
      onSaved(`${parts.filter(Boolean).join(" — ")}.`);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const summary = [
    selected.size === 0 ? "Nenhum tratamento marcado" : `${selected.size} tratamento${selected.size > 1 ? "s" : ""}`,
    images.length > 0 ? `${images.length} foto${images.length > 1 ? "s" : ""}` : null,
    total > 0 ? formatMoney(total) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return createPortal(
    <div className={uiStyles.overlay} onClick={onClose}>
      <div
        className={`${uiStyles.dialog} ${uiStyles.dialogExtraWide}`}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        // Altura fixa: trocar de etapa não faz o modal "pular" de tamanho.
        style={{ height: "min(640px, 88vh)" }}
      >
        <h3 className={uiStyles.dialogTitle} style={{ flexShrink: 0 }}>
          Registrar atendimento
        </h3>

        <div className={styles.tabBar} role="tablist" style={{ padding: 0, flexShrink: 0, marginTop: 4 }}>
          {STEPS.map((s, i) => {
            const target = i as Step;
            const reachable = canReach(target);
            return (
              <button
                key={s.label}
                type="button"
                role="tab"
                aria-selected={step === target}
                disabled={!reachable}
                onClick={() => goTo(target)}
                className={`${styles.tabBtn} ${step === target ? styles.tabBtnActive : ""}`}
                style={{ padding: "10px 2px", opacity: reachable ? 1 : 0.45, cursor: reachable ? "pointer" : "not-allowed" }}
              >
                {s.label}
                {i < step && stepValid[i] ? " ✓" : ""}
              </button>
            );
          })}
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12, paddingRight: 6, paddingTop: 14 }}>
          {step === 0 && (
            <>
              {loading && treatments.length === 0 ? (
                <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>Carregando…</div>
              ) : treatments.length === 0 ? (
                <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>Nenhum tratamento em aberto — adicione o que foi feito hoje.</div>
              ) : (
                treatments.map((t) => {
                  const debitAmount = debits.filter((d) => d.treatment_id === t.id).reduce((sum, d) => sum + d.amount, 0);
                  return (
                    <label key={t.id} className={tp.row} style={{ cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={selected.has(t.id)}
                        onChange={() => toggleSelected(t.id)}
                        style={{ width: 18, height: 18, accentColor: "var(--brand)", flexShrink: 0 }}
                      />
                      <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600 }}>
                        {t.tooth_region ? `${t.tooth_region} — ` : ""}
                        {t.treatment_name}
                      </span>
                      <span style={{ fontSize: 12.5, color: "var(--ink-soft)", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                        {debitAmount > 0 ? `${formatMoney(debitAmount)} em aberto` : t.price > 0 ? "pago" : "sem valor"}
                      </span>
                    </label>
                  );
                })
              )}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <button type="button" onClick={() => setNewTreatmentOpen(true)} className={`${styles.btn} ${styles.btnGhost}`} style={{ padding: "5px 12px", fontSize: 13 }}>
                  + Adicionar tratamento
                </button>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, cursor: "pointer" }}>
                  <input type="checkbox" checked={finalize} onChange={(e) => setFinalize(e.target.checked)} style={{ width: 18, height: 18, accentColor: "var(--brand)" }} />
                  Finalizar os tratamentos marcados
                </label>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div className={styles.field} style={{ maxWidth: 200 }}>
                <label className={styles.label}>Data*</label>
                <input type="date" className={styles.input} value={evolutionDate} onChange={(e) => setEvolutionDate(e.target.value)} />
              </div>
              <div className={styles.field}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <label className={styles.label} style={{ marginBottom: 0 }}>
                    Texto*
                  </label>
                  {dictation.supported && <DictationButton dictating={dictation.dictating} onToggle={dictation.toggle} />}
                </div>
                <textarea
                  className={styles.input}
                  rows={5}
                  value={text}
                  onChange={(e) => {
                    setTextTouched(true);
                    setText(e.target.value);
                  }}
                  placeholder="Descreva ou dite o que foi feito"
                  style={{ marginTop: 6 }}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Imagens (opcional, até {MAX_IMAGES})</label>
                <EvolutionImageUploader items={images} onChange={setImages} max={MAX_IMAGES} />
              </div>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 14, cursor: "pointer" }}>
                <input type="checkbox" checked={notifyPatient} onChange={(e) => setNotifyPatient(e.target.checked)} style={{ marginTop: 3 }} />
                <span>
                  Enviar ao paciente para assinar por WhatsApp
                  <span style={{ display: "block", fontSize: 12, color: "var(--ink-soft)" }}>Sem marcar, dá pra solicitar depois pela evolução.</span>
                </span>
              </label>
            </>
          )}

          {step === 2 && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: 13.5, color: "var(--ink-soft)" }}>Total em aberto dos tratamentos marcados</span>
                <span style={{ fontSize: 18, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{formatMoney(total)}</span>
              </div>
              {total <= 0 ? (
                <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>Nada em aberto para os tratamentos marcados.</div>
              ) : (
                <>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer" }}>
                    <input type="checkbox" checked={receiveNow} onChange={(e) => setReceiveNow(e.target.checked)} style={{ width: 18, height: 18, accentColor: "var(--brand)" }} />
                    Receber agora o valor total
                  </label>
                  {receiveNow && (
                    <div className={styles.field} style={{ maxWidth: 260 }}>
                      <label className={styles.label}>Meio de pagamento*</label>
                      <select className={styles.select} value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                        {PAYMENT_METHODS.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <p style={{ fontSize: 12, color: "var(--ink-faint)", margin: 0 }}>
                    Pagamento parcial? Desmarque e lance pela aba Débitos, que divide o saldo automaticamente.
                  </p>
                </>
              )}
              {appointmentId && (
                <p style={{ fontSize: 12.5, color: "var(--ink-soft)", margin: "6px 0 0" }}>Ao salvar, o agendamento é marcado como Atendido.</p>
              )}
            </>
          )}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
            paddingTop: 14,
            marginTop: 10,
            borderTop: "1px solid var(--line-soft)",
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 13, color: "var(--ink-soft)", fontVariantNumeric: "tabular-nums" }}>{summary}</span>
          <div style={{ display: "flex", gap: 10, marginLeft: "auto" }}>
            {step === 0 ? (
              <button type="button" disabled={saving} onClick={onClose} className={`${styles.btn} ${styles.btnGhost}`}>
                Cancelar
              </button>
            ) : (
              <button type="button" disabled={saving} onClick={() => goTo((step - 1) as Step)} className={`${styles.btn} ${styles.btnGhost}`}>
                Voltar
              </button>
            )}
            {step < 2 ? (
              <button type="button" disabled={!stepValid[step]} onClick={() => goTo((step + 1) as Step)} className={`${styles.btn} ${styles.btnPrimary}`}>
                Avançar
              </button>
            ) : (
              <button type="button" disabled={saving || !canSave} onClick={handleSave} className={`${styles.btn} ${styles.btnPrimary}`}>
                {saving ? "Salvando…" : "Salvar atendimento"}
              </button>
            )}
          </div>
        </div>

        {/* Dentro do dialog de propósito: o clique no fundo do modal de cima
            sobe pela árvore do React até aqui e para no stopPropagation, em
            vez de fechar este modal junto. */}
        <NewTreatmentModal
          open={newTreatmentOpen}
          onClose={() => {
            setNewTreatmentOpen(false);
            setReloadKey((k) => k + 1);
          }}
          clinicId={clinicId}
          patientId={patientId}
          onCreated={(created) => setSelected((prev) => new Set(prev).add(created.id))}
        />
      </div>
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>,
    document.body
  );
}
