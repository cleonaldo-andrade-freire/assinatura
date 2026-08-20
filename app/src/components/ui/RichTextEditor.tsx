"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import TextAlign from "@tiptap/extension-text-align";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { FontSize } from "@/lib/tiptap/fontSize";
import { useEscapeToClose } from "@/lib/useEscapeToClose";
import styles from "./RichTextEditor.module.css";

const FONT_SIZES = [
  { label: "Pequeno", px: "13px" },
  { label: "Normal", px: "15px" },
  { label: "Grande", px: "18px" },
  { label: "Título", px: "22px" },
  { label: "Destaque", px: "28px" },
];

function Btn({
  active,
  disabled,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`${styles.btn} ${active ? styles.btnActive : ""}`}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor, isFullscreen, onToggleFullscreen }: { editor: Editor; isFullscreen: boolean; onToggleFullscreen: () => void }) {
  function setLink() {
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Endereço do link (deixe em branco pra remover):", previous ?? "https://");
    if (url === null) return;
    if (!url.trim()) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  }

  return (
    <div className={styles.toolbar}>
      <Btn title="Desfazer" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M9 7L4 12l5 5M4 12h11a5 5 0 010 10h-1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Btn>
      <Btn title="Refazer" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M15 7l5 5-5 5M20 12H9A5 5 0 009 22h1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Btn>

      <div className={styles.sep} />

      <select
        className={styles.select}
        value={editor.isActive("heading", { level: 1 }) ? "h1" : editor.isActive("heading", { level: 2 }) ? "h2" : editor.isActive("heading", { level: 3 }) ? "h3" : "p"}
        onMouseDown={(e) => e.preventDefault()}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "p") editor.chain().focus().setParagraph().run();
          else editor.chain().focus().setHeading({ level: Number(v[1]) as 1 | 2 | 3 }).run();
        }}
        title="Estilo do bloco"
      >
        <option value="p">Parágrafo</option>
        <option value="h1">Título 1</option>
        <option value="h2">Título 2</option>
        <option value="h3">Título 3</option>
      </select>

      <select
        className={styles.select}
        defaultValue=""
        onMouseDown={(e) => e.preventDefault()}
        onChange={(e) => {
          if (e.target.value) editor.chain().focus().setFontSize(e.target.value).run();
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

      <Btn title="Negrito" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
        <strong>B</strong>
      </Btn>
      <Btn title="Itálico" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <em>I</em>
      </Btn>
      <Btn title="Sublinhado" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <span style={{ textDecoration: "underline" }}>U</span>
      </Btn>
      <Btn title="Tachado" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
        <span style={{ textDecoration: "line-through" }}>S</span>
      </Btn>

      <label className={styles.colorSwatch} title="Cor do texto">
        <input
          type="color"
          onMouseDown={(e) => e.preventDefault()}
          value={editor.getAttributes("textStyle").color || "#1e2b27"}
          onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
        />
      </label>

      <div className={styles.sep} />

      <Btn title="Alinhar à esquerda" active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 6h16M4 12h10M4 18h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </Btn>
      <Btn title="Centralizar" active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 6h16M7 12h10M5 18h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </Btn>
      <Btn title="Alinhar à direita" active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 6h16M10 12h10M6 18h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </Btn>
      <Btn title="Justificar" active={editor.isActive({ textAlign: "justify" })} onClick={() => editor.chain().focus().setTextAlign("justify").run()}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </Btn>

      <div className={styles.sep} />

      <Btn title="Lista com marcadores" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        •≡
      </Btn>
      <Btn title="Lista numerada" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        1.
      </Btn>
      <Btn title="Citação" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M7 7a3 3 0 00-3 3v3h4v-6zm10 0a3 3 0 00-3 3v3h4v-6z" fill="currentColor" />
        </svg>
      </Btn>
      <Btn title="Link" active={editor.isActive("link")} onClick={setLink}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M9 15l6-6M10 6l1.5-1.5a3.5 3.5 0 015 5L15 11M14 18l-1.5 1.5a3.5 3.5 0 01-5-5L9 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Btn>
      <Btn title="Linha horizontal" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
        —
      </Btn>
      <Btn title="Limpar formatação" onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}>
        ⌫
      </Btn>

      <button
        type="button"
        className={`${styles.btn} ${styles.expandBtn}`}
        onMouseDown={(e) => e.preventDefault()}
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

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      Color,
      FontSize,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Link.configure({ openOnClick: false, autolink: false }),
      Placeholder.configure({ placeholder }),
    ],
    content: value,
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
    editorProps: {
      attributes: { class: styles.editable },
    },
  });

  useEscapeToClose(() => setIsFullscreen(false), isFullscreen);

  useEffect(() => {
    if (!isFullscreen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isFullscreen]);

  if (!editor) return null;

  const toolbar = <Toolbar editor={editor} isFullscreen={isFullscreen} onToggleFullscreen={() => setIsFullscreen((f) => !f)} />;
  const content = <EditorContent editor={editor} />;

  if (isFullscreen && typeof document !== "undefined") {
    return createPortal(
      <div className={styles.fullscreenOverlay} role="dialog" aria-modal="true">
        <div className={styles.fullscreenHeader}>
          <p className={styles.fullscreenTitle}>{label || "Editando"}</p>
          <button type="button" onClick={() => setIsFullscreen(false)} className={styles.btn} style={{ fontWeight: 600, minWidth: "auto", padding: "0 14px" }}>
            Concluir
          </button>
        </div>
        <div className={styles.fullscreenBody}>
          <div className={styles.wrap}>
            {toolbar}
            {content}
          </div>
        </div>
      </div>,
      document.body
    );
  }

  return (
    <div className={styles.wrap}>
      {toolbar}
      {content}
    </div>
  );
}
