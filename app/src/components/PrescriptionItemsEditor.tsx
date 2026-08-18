"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PRESCRIPTION_CONTROL_OPTIONS } from "@/lib/prescriptionControl";
import type { PrescriptionItem } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";
import uiStyles from "@/components/ui/ui.module.css";

interface MedicationSuggestion {
  id: string;
  name: string;
  presentation: string | null;
  default_dosage: string | null;
}

const emptyItem: PrescriptionItem = {
  drug_name: "",
  dosage: "",
  instructions: "",
  generic_allowed: false,
  control_type: "comum",
};

export function PrescriptionItemsEditor({
  items,
  onChange,
}: {
  items: PrescriptionItem[];
  onChange: (items: PrescriptionItem[]) => void;
}) {
  const [newItem, setNewItem] = useState<PrescriptionItem>(emptyItem);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<MedicationSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Suggestions logic for newItem
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (newItem.drug_name.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/medications/search?q=${encodeURIComponent(newItem.drug_name.trim())}`);
        if (!res.ok) return;
        const data = await res.json();
        setSuggestions(data.medications ?? []);
      } catch {
        // ignora
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [newItem.drug_name]);

  function handleAddItem() {
    if (!newItem.drug_name.trim()) return;
    onChange([...items, newItem]);
    setNewItem(emptyItem);
    setIsModalOpen(false);
  }

  function removeItem(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  return (
    <div>
      {/* Lista de itens adicionados */}
      {items.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          {items.map((item, index) => (
            <div
              key={index}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "8px 12px",
                background: "var(--surface-sunken)",
                border: "1px solid var(--line-soft)",
                borderRadius: "var(--radius-sm)",
                marginBottom: 8,
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 13.5, color: "var(--ink-dark)" }}>
                  {item.drug_name}
                </div>
                <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 2 }}>
                  {item.dosage} • {item.instructions}
                  {item.control_type === "controlado_especial" && (
                    <span style={{ color: "var(--danger)", marginLeft: 6, fontWeight: 500 }}>
                      (Controlado)
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeItem(index)}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--danger)",
                  cursor: "pointer",
                  padding: "4px 8px",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                Remover
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setIsModalOpen(true)}
        className={`${styles.btn} ${styles.btnGhost}`}
        style={{ width: "100%", justifyContent: "center", border: "1px dashed var(--line-soft)" }}
      >
        + Adicionar medicamento
      </button>

      {/* Modal para adicionar novo item */}
      {isModalOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div className={uiStyles.overlay} onClick={() => setIsModalOpen(false)} style={{ zIndex: 9999 }}>
            <div
              className={`${uiStyles.dialog} ${uiStyles.dialogWide}`}
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: 500, padding: 20 }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <h3 className={uiStyles.dialogTitle} style={{ margin: 0, fontSize: 16 }}>
                  {items.length === 0 ? "Adicionar medicamento" : "Adicionar outro medicamento"}
                </h3>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-soft)" }}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div className={styles.field} style={{ position: "relative" }}>
                  <label className={styles.label}>Nome do medicamento</label>
                <input
                  type="text"
                  className={styles.input}
                  value={newItem.drug_name}
                  onChange={(e) => {
                    setNewItem({ ...newItem, drug_name: e.target.value });
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                  autoComplete="off"
                  placeholder="Ex.: Amoxicilina 500mg"
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
                            setNewItem({
                              ...newItem,
                              drug_name: s.presentation ? `${s.name} — ${s.presentation}` : s.name,
                            });
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
              </div>

              <div className={styles.formRow}>
                <div className={styles.field}>
                  <label className={styles.label}>Dosagem</label>
                  <input
                    type="text"
                    className={styles.input}
                    value={newItem.dosage}
                    onChange={(e) => setNewItem({ ...newItem, dosage: e.target.value })}
                    placeholder="Ex.: 1 comprimido"
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Posologia</label>
                  <input
                    type="text"
                    className={styles.input}
                    value={newItem.instructions}
                    onChange={(e) => setNewItem({ ...newItem, instructions: e.target.value })}
                    placeholder="Ex.: a cada 8 horas, por 7 dias"
                  />
                </div>
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Tipo de controle</label>
                <select
                  className={styles.select}
                  value={newItem.control_type}
                  onChange={(e) =>
                    setNewItem({ ...newItem, control_type: e.target.value as PrescriptionItem["control_type"] })
                  }
                >
                  {PRESCRIPTION_CONTROL_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {newItem.control_type === "controlado_especial" && (
                <div
                  style={{
                    background: "#fbe2e2",
                    border: "1px solid #e6b3b3",
                    color: "#8a2c2c",
                    borderRadius: "var(--radius-sm)",
                    padding: "8px 12px",
                    fontSize: 12.5,
                    marginBottom: 12,
                  }}
                >
                  ⚠️ Não emite controlado especial (use talão físico).
                </div>
              )}

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={newItem.generic_allowed}
                      onChange={(e) => setNewItem({ ...newItem, generic_allowed: e.target.checked })}
                    />
                    Aceita genérico
                  </label>
                  <button
                    type="button"
                    onClick={handleAddItem}
                    disabled={!newItem.drug_name.trim()}
                    className={`${styles.btn} ${styles.btnPrimary}`}
                    style={{ padding: "6px 16px" }}
                  >
                    Adicionar à lista
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
