"use client";

import { useEffect, useRef, useState } from "react";
import { formatBRPhoneLocal, formatCPF } from "@/lib/validation";
import styles from "@/styles/shell.module.css";

export interface PatientSuggestion {
  id: string;
  name: string;
  cpf: string | null;
  phone: string | null;
  has_photo: boolean;
}

/** Campo de busca de paciente com foto/inicial + telefone no resultado — mesmo
 * componente usado pelo formulário de agendamento, extraído aqui pro
 * formulário de prótese reaproveitar sem duplicar a lógica de debounce e a
 * marcação do dropdown. */
export function PatientSearchField({
  clinicId,
  name,
  onChangeName,
  onSelect,
  label = "Nome do paciente",
  hint,
}: {
  clinicId: string;
  name: string;
  onChangeName: (name: string) => void;
  onSelect: (patient: PatientSuggestion) => void;
  label?: string;
  hint?: string;
}) {
  const [suggestions, setSuggestions] = useState<PatientSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (name.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/clinics/${clinicId}/patients/search?q=${encodeURIComponent(name.trim())}`);
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
  }, [name, clinicId]);

  return (
    <div className={styles.field} style={{ position: "relative" }}>
      <label htmlFor="patientSearch" className={styles.label}>
        {label}
      </label>
      <input
        id="patientSearch"
        type="text"
        className={styles.input}
        value={name}
        onChange={(e) => {
          onChangeName(e.target.value);
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
                onClick={() => {
                  onSelect(s);
                  setShowSuggestions(false);
                  setSuggestions([]);
                }}
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
      {hint && <p className={styles.hint}>{hint}</p>}
    </div>
  );
}
