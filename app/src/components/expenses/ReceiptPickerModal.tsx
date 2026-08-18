"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useEscapeToClose } from "@/lib/useEscapeToClose";
import uiStyles from "@/components/ui/ui.module.css";
import shellStyles from "@/styles/shell.module.css";
import ex from "./expenses.module.css";

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp", "application/pdf"];
const MAX_BYTES = 8 * 1024 * 1024;

/** Escolher/arrastar UM arquivo de comprovante — mesmo molde visual do envio de imagens do paciente, só que pra um arquivo só e sem o passo de descrição. Não faz upload sozinho: só devolve o File escolhido pro chamador decidir quando enviar. */
export function ReceiptPickerModal({ open, onClose, onPicked }: { open: boolean; onClose: () => void; onPicked: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEscapeToClose(onClose, open);

  if (!open || typeof document === "undefined") return null;

  function handleFiles(list: FileList | File[]) {
    const file = Array.from(list)[0];
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError("Formato não suportado — use PNG, JPEG, WEBP ou PDF.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Arquivo muito grande — o limite é 8MB.");
      return;
    }
    setError(null);
    onPicked(file);
    onClose();
  }

  return createPortal(
    <div className={uiStyles.overlay} onClick={onClose}>
      <div className={uiStyles.dialog} style={{ maxWidth: 440 }} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
          <h3 className={uiStyles.dialogTitle}>Anexar comprovante</h3>
        </div>

        <div
          className={`${ex.dropzone} ${dragActive ? ex.dropzoneActive : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
            handleFiles(e.dataTransfer.files);
          }}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 16V4M12 4l-5 5M12 4l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <p style={{ margin: 0, fontWeight: 600, color: "var(--ink)" }}>Escolha ou arraste o comprovante aqui</p>
          <p style={{ margin: 0, fontSize: 12.5 }}>Tamanho máximo: 8MB · Formatos: PNG, JPEG, WEBP, PDF</p>
          <button type="button" onClick={() => inputRef.current?.click()} className={`${shellStyles.btn} ${shellStyles.btnPrimary}`} style={{ marginTop: 6 }}>
            Escolher arquivo
          </button>
        </div>
        {error && <p style={{ color: "var(--danger)", fontSize: 12.5, margin: "10px 0 0" }}>{error}</p>}

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(",")}
          hidden
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
    </div>,
    document.body
  );
}
