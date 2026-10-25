"use client";

import styles from "@/styles/shell.module.css";

/** Botão "🎤 Ditar por voz" ao lado do rótulo de um campo de texto — par visual do `useDictation`. */
export function DictationButton({ dictating, onToggle }: { dictating: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`${styles.btn} ${styles.btnGhost}`}
      style={{ padding: "3px 10px", fontSize: 12, color: dictating ? "var(--danger)" : undefined, borderColor: dictating ? "var(--danger)" : undefined }}
      title={dictating ? "Parar ditado" : "Ditar por voz"}
    >
      {dictating ? "● Gravando… (clique pra parar)" : "🎤 Ditar por voz"}
    </button>
  );
}
