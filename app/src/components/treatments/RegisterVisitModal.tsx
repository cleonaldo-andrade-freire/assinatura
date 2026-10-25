"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { DictationButton } from "@/components/treatments/DictationButton";
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

function formatMoney(value: number): string {
  return `R$ ${formatMoneyDisplay(value)}`;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--ink-soft)" }}>{children}</div>;
}

/**
 * "Registrar atendimento" — atalho pro caso mais comum da clínica numa
 * tela só: escolher os tratamentos da sessão, escrever UMA evolução (com
 * ditado) e receber UM pagamento (Pix por padrão). Pagamento parcial não
 * entra aqui de propósito — continua na aba Débitos, que já tem a regra de
 * divisão. As telas individuais (Novo tratamento, Finalizar, Receber)
 * seguem existindo.
 */
export function RegisterVisitModal({
  open,
  onClose,
  clinicId,
  patientId,
  initialSelectedIds,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  clinicId: string;
  patientId: string;
  /** Tratamentos já marcados na lista do painel — entram pré-selecionados. */
  initialSelectedIds: string[];
  onSaved: (message: string) => void;
}) {
  const { toasts, push, dismiss } = useToasts();

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
    setSelected(new Set(initialSelectedIds));
    setFinalize(true);
    setEvolutionDate(brDateOnly());
    setText("");
    setTextTouched(false);
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
  const canSave = selected.size > 0 && text.trim().length > 0 && (!willReceive || !!paymentMethod);

  async function handleSave() {
    dictation.stop();
    if (!canSave) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/patients/${patientId}/atendimento`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          treatment_ids: Array.from(selected),
          evolution_date: evolutionDate,
          evolution_text: text.trim(),
          finalize,
          notify_patient: notifyPatient,
          payment_method: willReceive ? paymentMethod : null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        push(data?.message ? `Não foi possível salvar: ${data.message}` : "Falha ao salvar o atendimento. Nada foi gravado — tenta de novo.");
        if (res.status === 409) setReloadKey((k) => k + 1);
        return;
      }
      const parts = ["Atendimento registrado", finalize ? "tratamentos finalizados" : null, willReceive ? `${formatMoney(total)} recebido via ${paymentMethod}` : null];
      onSaved(`${parts.filter(Boolean).join(" — ")}.`);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className={uiStyles.overlay} onClick={onClose}>
      <div className={`${uiStyles.dialog} ${uiStyles.dialogExtraWide}`} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h3 className={uiStyles.dialogTitle} style={{ flexShrink: 0 }}>
          Registrar atendimento
        </h3>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 18, paddingRight: 6, marginTop: 6 }}>
          {/* 1. Tratamentos */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <SectionTitle>1. Tratamentos desta sessão</SectionTitle>
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
          </div>

          {/* 2. Evolução */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 14, borderTop: "1px solid var(--line-soft)" }}>
            <SectionTitle>2. Evolução</SectionTitle>
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
                rows={4}
                value={text}
                onChange={(e) => {
                  setTextTouched(true);
                  setText(e.target.value);
                }}
                placeholder="Marque os tratamentos acima ou dite o que foi feito"
                style={{ marginTop: 6 }}
              />
            </div>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 14, cursor: "pointer" }}>
              <input type="checkbox" checked={notifyPatient} onChange={(e) => setNotifyPatient(e.target.checked)} style={{ marginTop: 3 }} />
              <span>
                Enviar ao paciente para assinar por WhatsApp
                <span style={{ display: "block", fontSize: 12, color: "var(--ink-soft)" }}>Sem marcar, dá pra solicitar depois pela evolução.</span>
              </span>
            </label>
          </div>

          {/* 3. Pagamento */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 14, borderTop: "1px solid var(--line-soft)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <SectionTitle>3. Pagamento</SectionTitle>
              <span style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{formatMoney(total)}</span>
            </div>
            {total <= 0 ? (
              <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>
                {selected.size === 0 ? "Marque os tratamentos para ver o valor." : "Nada em aberto para os tratamentos marcados."}
              </div>
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
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 14, marginTop: 10, borderTop: "1px solid var(--line-soft)", flexShrink: 0 }}>
          <button type="button" disabled={saving} onClick={onClose} className={`${styles.btn} ${styles.btnGhost}`}>
            Cancelar
          </button>
          <button type="button" disabled={saving || !canSave} onClick={handleSave} className={`${styles.btn} ${styles.btnPrimary}`}>
            {saving ? "Salvando…" : "Salvar atendimento"}
          </button>
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
