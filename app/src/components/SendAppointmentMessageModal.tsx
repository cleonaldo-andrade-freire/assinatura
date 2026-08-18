"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useEscapeToClose } from "@/lib/useEscapeToClose";
import uiStyles from "@/components/ui/ui.module.css";
import styles from "@/styles/shell.module.css";

/** Mensagem avulsa por WhatsApp pro paciente — comunicação rápida, texto livre, sem template fixo (diferente do reenvio de confirmação). */
export function SendAppointmentMessageModal({
  open,
  onClose,
  sending,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  sending: boolean;
  onConfirm: (message: string) => void;
}) {
  const [message, setMessage] = useState("");

  useEscapeToClose(onClose, open);

  useEffect(() => {
    if (open) setMessage("");
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    onConfirm(message.trim());
  }

  return createPortal(
    <div className={uiStyles.overlay} onClick={onClose}>
      <div className={uiStyles.dialog} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h3 className={uiStyles.dialogTitle} style={{ marginBottom: 14 }}>
          Enviar mensagem ao paciente
        </h3>

        <form onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label htmlFor="apptMessage" className={styles.label}>
              Mensagem*
            </label>
            <textarea
              id="apptMessage"
              className={styles.input}
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Ex.: Só avisando que vamos atrasar uns 10 minutos…"
              maxLength={1000}
              required
              autoFocus
            />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
            <button type="button" disabled={sending} onClick={onClose} className={`${styles.btn} ${styles.btnGhost}`}>
              Cancelar
            </button>
            <button type="submit" disabled={sending || !message.trim()} className={`${styles.btn} ${styles.btnPrimary}`}>
              {sending ? "Enviando…" : "Enviar por WhatsApp"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
