"use client";

import { useState } from "react";
import styles from "@/styles/shell.module.css";

/**
 * Combobox de especialidade — sugere as já usadas nesta tabela (poucas, na
 * prática), mas continua sendo texto livre: digitar algo novo simplesmente
 * cria aquela especialidade na hora de salvar o item, sem precisar de uma
 * tela de cadastro separada. "Excluir" uma especialidade é implícito: some
 * da lista de sugestões sozinha quando nenhum tratamento mais usa ela.
 */
export function SpecialtyCombobox({
  id,
  value,
  onChange,
  options,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  const [open, setOpen] = useState(false);
  const filtered = value.trim() ? options.filter((o) => o.toLowerCase().includes(value.trim().toLowerCase())) : options;

  return (
    <div style={{ position: "relative" }}>
      <input
        id={id}
        type="text"
        className={styles.input}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Opcional"
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
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
            maxHeight: 180,
            overflowY: "auto",
          }}
        >
          {filtered.map((o) => (
            <li key={o}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(o);
                  setOpen(false);
                }}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "7px 10px",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  borderRadius: 6,
                  fontSize: 13.5,
                }}
              >
                {o}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
