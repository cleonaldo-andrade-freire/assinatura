"use client";

import { useEffect, useRef, useState } from "react";
import { PRESCRIPTION_CONTROL_OPTIONS } from "@/lib/prescriptionControl";
import type { PrescriptionItem } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

interface MedicationSuggestion {
  id: string;
  name: string;
  presentation: string | null;
  default_dosage: string | null;
}

export function PrescriptionItemsEditor({
  items,
  onChange,
}: {
  items: PrescriptionItem[];
  onChange: (items: PrescriptionItem[]) => void;
}) {
  function updateItem(index: number, patch: Partial<PrescriptionItem>) {
    const next = items.slice();
    next[index] = { ...next[index], ...patch };
    onChange(next);
  }

  function addItem() {
    onChange([...items, { drug_name: "", dosage: "", instructions: "", generic_allowed: false, control_type: "comum" }]);
  }

  function removeItem(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  return (
    <div>
      {items.map((item, index) => (
        <PrescriptionItemRow
          key={index}
          index={index}
          item={item}
          onChange={(patch) => updateItem(index, patch)}
          onRemove={items.length > 1 ? () => removeItem(index) : undefined}
        />
      ))}
      <button type="button" onClick={addItem} className={`${styles.btn} ${styles.btnGhost}`}>
        + Adicionar medicamento
      </button>
    </div>
  );
}

function PrescriptionItemRow({
  index,
  item,
  onChange,
  onRemove,
}: {
  index: number;
  item: PrescriptionItem;
  onChange: (patch: Partial<PrescriptionItem>) => void;
  onRemove?: () => void;
}) {
  const [suggestions, setSuggestions] = useState<MedicationSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (item.drug_name.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/medications/search?q=${encodeURIComponent(item.drug_name.trim())}`);
        if (!res.ok) return;
        const data = await res.json();
        setSuggestions(data.medications ?? []);
      } catch {
        // autocomplete de medicamento é conveniência — falha silenciosa não trava o formulário
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.drug_name]);

  return (
    <div
      style={{
        border: item.control_type === "controlado_especial" ? "1.5px solid var(--danger)" : "1px solid var(--line)",
        borderRadius: "var(--radius-sm)",
        padding: 14,
        marginBottom: 12,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-soft)", textTransform: "uppercase" }}>
          Medicamento {index + 1}
        </span>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              color: "var(--danger)",
              fontSize: 12.5,
              fontWeight: 600,
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            Remover
          </button>
        )}
      </div>

      <div className={styles.field} style={{ position: "relative" }}>
        <label className={styles.label}>Nome do medicamento</label>
        <input
          type="text"
          className={styles.input}
          value={item.drug_name}
          onChange={(e) => {
            onChange({ drug_name: e.target.value });
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          autoComplete="off"
          placeholder="Ex.: Amoxicilina 500mg, ou busque pelo nome"
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
                    onChange({ drug_name: s.presentation ? `${s.name} — ${s.presentation}` : s.name });
                    setShowSuggestions(false);
                    setSuggestions([]);
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "8px 10px",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    borderRadius: 6,
                    fontSize: 13.5,
                  }}
                >
                  {s.name}
                  {s.presentation && <span style={{ color: "var(--ink-soft)" }}> — {s.presentation}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className={styles.hint}>
          Sugestões vêm de um conjunto inicial de medicamentos comuns em odontologia — o campo aceita qualquer nome
          digitado.
        </p>
      </div>

      <div className={styles.formRow}>
        <div className={styles.field}>
          <label className={styles.label}>Dosagem</label>
          <input
            type="text"
            className={styles.input}
            value={item.dosage}
            onChange={(e) => onChange({ dosage: e.target.value })}
            placeholder="Ex.: 1 comprimido"
            required
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Posologia</label>
          <input
            type="text"
            className={styles.input}
            value={item.instructions}
            onChange={(e) => onChange({ instructions: e.target.value })}
            placeholder="Ex.: a cada 8 horas, por 7 dias"
            required
          />
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Tipo de controle</label>
        <select
          className={styles.select}
          value={item.control_type}
          onChange={(e) => onChange({ control_type: e.target.value as PrescriptionItem["control_type"] })}
        >
          {PRESCRIPTION_CONTROL_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <p className={styles.hint}>
          Classificação informada por você — o sistema não valida se está correta.
        </p>
      </div>

      {item.control_type === "controlado_especial" && (
        <div
          style={{
            background: "#fbe2e2",
            border: "1px solid #e6b3b3",
            color: "#8a2c2c",
            borderRadius: "var(--radius-sm)",
            padding: "10px 12px",
            fontSize: 13,
            marginBottom: 14,
          }}
        >
          ⚠️ Este sistema ainda não emite prescrição de controlado especial — precisa ser feita em talão físico ou
          receituário próprio, fora daqui. Troque o tipo de controle ou remova este item pra conseguir emitir.
        </div>
      )}

      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
        <input
          type="checkbox"
          checked={item.generic_allowed}
          onChange={(e) => onChange({ generic_allowed: e.target.checked })}
        />
        Aceita substituição por medicamento genérico
      </label>
    </div>
  );
}
