"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useEscapeToClose } from "@/lib/useEscapeToClose";
import styles from "./RichTextEditor.module.css";

const FONT_SIZES = [
  { label: "Pequeno", px: 13 },
  { label: "Normal", px: 15 },
  { label: "Grande", px: 18 },
  { label: "Título", px: 22 },
];

/** Marcador temporário: `execCommand("fontSize")` só sabe produzir a tag
 * legada `<font size="N">` (N de 1 a 7) — aplicamos com um valor
 * improvável de aparecer organicamente (7) e trocamos pelo `<span
 * style="font-size:…">` que realmente queremos logo em seguida. Truque
 * padrão pra ter tamanho de fonte em pixel com `execCommand`, que não
 * suporta isso nativamente. */
const FONT_SIZE_MARKER = "7";

function Toolbar({
  onBold,
  onItalic,
  onUnderline,
  onList,
  onClearFormat,
  onFontSize,
  isFullscreen,
  onToggleFullscreen,
}: {
  onBold: () => void;
  onItalic: () => void;
  onUnderline: () => void;
  onList: () => void;
  onClearFormat: () => void;
  onFontSize: (px: number) => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}) {
  // onMouseDown com preventDefault em cada botão — sem isso, o clique tira o
  // foco/seleção de texto do editor antes do execCommand rodar, e a
  // formatação não tem em cima do quê aplicar.
  function stop(e: React.MouseEvent) {
    e.preventDefault();
  }

  return (
    <div className={styles.toolbar}>
      <button type="button" className={styles.btn} onMouseDown={stop} onClick={onBold} title="Negrito">
        B
      </button>
      <button type="button" className={`${styles.btn} ${styles.italic}`} onMouseDown={stop} onClick={onItalic} title="Itálico">
        I
      </button>
      <button type="button" className={`${styles.btn} ${styles.underline}`} onMouseDown={stop} onClick={onUnderline} title="Sublinhado">
        U
      </button>
      <div className={styles.sep} />
      <select
        className={styles.select}
        defaultValue=""
        onMouseDown={stop}
        onChange={(e) => {
          const px = Number(e.target.value);
          if (px) onFontSize(px);
          e.target.value = "";
        }}
        title="Tamanho da fonte"
      >
        <option value="" disabled>
          Tamanho
        </option>
        {FONT_SIZES.map((s) => (
          <option key={s.px} value={s.px}>
            {s.label}
          </option>
        ))}
      </select>
      <div className={styles.sep} />
      <button type="button" className={styles.btn} onMouseDown={stop} onClick={onList} title="Lista com marcadores">
        •
      </button>
      <button type="button" className={styles.btn} onMouseDown={stop} onClick={onClearFormat} title="Limpar formatação">
        ⌫
      </button>
      <button
        type="button"
        className={`${styles.btn} ${styles.expandBtn}`}
        onMouseDown={stop}
        onClick={onToggleFullscreen}
        title={isFullscreen ? "Sair da tela cheia" : "Editar em tela cheia"}
      >
        {isFullscreen ? (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M9 3v4a2 2 0 01-2 2H3M15 3v4a2 2 0 002 2h4M9 21v-4a2 2 0 00-2-2H3M15 21v-4a2 2 0 012-2h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M8 3H5a2 2 0 00-2 2v3M16 3h3a2 2 0 012 2v3M8 21H5a2 2 0 01-2-2v-3M16 21h3a2 2 0 002-2v-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
    </div>
  );
}

function EditableArea({
  editorRef,
  initialHtml,
  onChange,
  placeholder,
  className,
}: {
  editorRef: React.RefObject<HTMLDivElement>;
  initialHtml: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className: string;
}) {
  // Só roda no mount (contentEditable é não-controlado de propósito — deixar
  // o React re-setar innerHTML a cada render por causa de um `value`
  // controlado faria o cursor pular pro início a cada tecla digitada).
  useEffect(() => {
    if (editorRef.current) editorRef.current.innerHTML = initialHtml || "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={editorRef}
      className={className}
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder}
      onInput={() => onChange(editorRef.current?.innerHTML ?? "")}
      onBlur={() => onChange(editorRef.current?.innerHTML ?? "")}
    />
  );
}

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
  const editorRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Muda a cada entrada/saída de tela cheia pra forçar o remount do
  // EditableArea com o conteúdo mais recente (que já está em `value`, porque
  // todo input já disparou onChange) — mover o editor pra dentro/fora do
  // portal troca o container real, então precisamos de um mount novo de
  // qualquer forma; isso só garante que ele nasça com o texto atualizado.
  const [mountKey, setMountKey] = useState(0);

  useEscapeToClose(() => setIsFullscreen(false), isFullscreen);

  useEffect(() => {
    if (!isFullscreen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isFullscreen]);

  function toggleFullscreen() {
    setMountKey((k) => k + 1);
    setIsFullscreen((f) => !f);
  }

  function emit() {
    onChange(editorRef.current?.innerHTML ?? "");
  }

  function exec(command: string) {
    editorRef.current?.focus();
    document.execCommand(command, false);
    emit();
  }

  function applyFontSize(px: number) {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    document.execCommand("fontSize", false, FONT_SIZE_MARKER);
    editor.querySelectorAll(`font[size="${FONT_SIZE_MARKER}"]`).forEach((node) => {
      const span = document.createElement("span");
      span.style.fontSize = `${px}px`;
      span.innerHTML = node.innerHTML;
      node.replaceWith(span);
    });
    emit();
  }

  const toolbar = (
    <Toolbar
      onBold={() => exec("bold")}
      onItalic={() => exec("italic")}
      onUnderline={() => exec("underline")}
      onList={() => exec("insertUnorderedList")}
      onClearFormat={() => exec("removeFormat")}
      onFontSize={applyFontSize}
      isFullscreen={isFullscreen}
      onToggleFullscreen={toggleFullscreen}
    />
  );

  const editor: ReactNode = (
    <EditableArea
      key={mountKey}
      editorRef={editorRef}
      initialHtml={value}
      onChange={onChange}
      placeholder={placeholder}
      className={styles.editable}
    />
  );

  if (isFullscreen && typeof document !== "undefined") {
    return createPortal(
      <div className={styles.fullscreenOverlay} role="dialog" aria-modal="true">
        <div className={styles.fullscreenHeader}>
          <p className={styles.fullscreenTitle}>{label || "Editando"}</p>
          <button type="button" onClick={toggleFullscreen} className={styles.btn} style={{ fontWeight: 600, minWidth: "auto", padding: "0 14px" }}>
            Concluir
          </button>
        </div>
        <div className={styles.fullscreenBody}>
          <div className={styles.wrap}>
            {toolbar}
            {editor}
          </div>
        </div>
      </div>,
      document.body
    );
  }

  return (
    <div className={styles.wrap}>
      {toolbar}
      {editor}
    </div>
  );
}
