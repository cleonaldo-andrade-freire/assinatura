"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";
import { useEscapeToClose } from "@/lib/useEscapeToClose";
import styles from "./RichTextEditor.module.css";

const TOOLBAR_MODULES = [
  [{ header: [1, 2, 3, false] }],
  [{ size: ["small", false, "large", "huge"] }],
  ["bold", "italic", "underline", "strike"],
  [{ color: [] }, { background: [] }],
  [{ list: "ordered" }, { list: "bullet" }],
  [{ align: [] }],
  ["blockquote", "link"],
  ["clean"],
];

const FORMATS = ["header", "size", "bold", "italic", "underline", "strike", "color", "background", "list", "align", "blockquote", "link"];

/**
 * Editor de texto rico completo — Quill (via react-quill-new), não uma
 * barra de ferramentas montada à mão: título, tamanho, negrito/itálico/
 * sublinhado/tachado, cor/destaque, listas, alinhamento, citação, link,
 * desfazer/refazer (Ctrl+Z nativo do Quill) e limpar formatação já vêm
 * prontos na própria biblioteca. O HTML de saída é saneado no servidor
 * antes de salvar (ver `sanitizeConsentTermHtml`), cuja allowlist reflete
 * exatamente como o Quill serializa cada formato.
 */
export function RichTextEditor({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  label?: string;
}) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const modules = useMemo(() => ({ toolbar: TOOLBAR_MODULES }), []);

  useEscapeToClose(() => setIsFullscreen(false), isFullscreen);

  useEffect(() => {
    if (!isFullscreen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isFullscreen]);

  const editor = (
    <ReactQuill
      theme="snow"
      value={value}
      onChange={onChange}
      modules={modules}
      formats={FORMATS}
      placeholder={placeholder}
      className={styles.quillRoot}
    />
  );

  if (isFullscreen && typeof document !== "undefined") {
    return createPortal(
      <div className={styles.fullscreenOverlay} role="dialog" aria-modal="true">
        <div className={styles.fullscreenHeader}>
          <p className={styles.fullscreenTitle}>{label || "Editando"}</p>
          <button type="button" onClick={() => setIsFullscreen(false)} className={styles.exitFullscreenBtn}>
            Concluir
          </button>
        </div>
        <div className={styles.fullscreenBody}>{editor}</div>
      </div>,
      document.body
    );
  }

  return (
    <div className={styles.wrap}>
      {editor}
      <button type="button" className={styles.expandBtn} onClick={() => setIsFullscreen(true)} title="Editar em tela cheia">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M8 3H5a2 2 0 00-2 2v3M16 3h3a2 2 0 012 2v3M8 21H5a2 2 0 01-2-2v-3M16 21h3a2 2 0 002-2v-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Tela cheia
      </button>
    </div>
  );
}
