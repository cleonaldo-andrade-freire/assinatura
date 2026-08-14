"use client";

import { useState } from "react";
import styles from "@/styles/shell.module.css";
import odontoStyles from "./odontogram.module.css";

const REGIONS = ["Maxila", "Mandíbula", "Face", "Arcada Superior", "Arcada Inferior", "Arcadas"];

// Notação FDI (padrão odontológico de dois dígitos) — mesma disposição por
// quadrante de qualquer odontograma: superior direito → superior esquerdo na
// linha de cima, inferior direito → inferior esquerdo na de baixo.
const PERMANENT_UPPER_RIGHT = ["18", "17", "16", "15", "14", "13", "12", "11"];
const PERMANENT_UPPER_LEFT = ["21", "22", "23", "24", "25", "26", "27", "28"];
const PERMANENT_LOWER_RIGHT = ["48", "47", "46", "45", "44", "43", "42", "41"];
const PERMANENT_LOWER_LEFT = ["31", "32", "33", "34", "35", "36", "37", "38"];

const DECIDUOUS_UPPER_RIGHT = ["55", "54", "53", "52", "51"];
const DECIDUOUS_UPPER_LEFT = ["61", "62", "63", "64", "65"];
const DECIDUOUS_LOWER_RIGHT = ["85", "84", "83", "82", "81"];
const DECIDUOUS_LOWER_LEFT = ["71", "72", "73", "74", "75"];

type Tab = "permanent" | "deciduous";

function ToothButton({ number, selected, onClick }: { number: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${odontoStyles.tooth} ${selected ? odontoStyles.toothSelected : ""}`}
      title={`Dente ${number}`}
    >
      {number}
    </button>
  );
}

/**
 * Seletor de dente/região pra uma linha de tratamento — multi-seleção
 * (odontograma completo: permanentes + decíduos, notação FDI, sem a aba HOF
 * por decisão explícita). Cada dente/região clicado entra numa lista; quem
 * chama (`TreatmentFormModal`) gera UMA linha de orçamento por item
 * selecionado, cada uma com o valor cheio — mesmo padrão da referência
 * (tratamento igual em 2 dentes = 2 linhas, não o valor dividido).
 */
export function ToothRegionSelect({
  value,
  onChange,
  single,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  /** Editar um tratamento já existente é sempre um dente/região só — clicar
   * troca a seleção em vez de acumular (mesmo componente da tela de
   * adicionar, só o comportamento de clique muda). */
  single?: boolean;
}) {
  const [tab, setTab] = useState<Tab>("permanent");

  function toggle(v: string) {
    if (single) {
      onChange(value.includes(v) ? [] : [v]);
      return;
    }
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  }

  const upperRight = tab === "permanent" ? PERMANENT_UPPER_RIGHT : DECIDUOUS_UPPER_RIGHT;
  const upperLeft = tab === "permanent" ? PERMANENT_UPPER_LEFT : DECIDUOUS_UPPER_LEFT;
  const lowerRight = tab === "permanent" ? PERMANENT_LOWER_RIGHT : DECIDUOUS_LOWER_RIGHT;
  const lowerLeft = tab === "permanent" ? PERMANENT_LOWER_LEFT : DECIDUOUS_LOWER_LEFT;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
        <label className={styles.label} style={{ marginBottom: 0 }}>
          Selecionar dente/região{" "}
          {!single && <span style={{ fontWeight: 400, color: "var(--ink-faint)" }}>(pode marcar mais de um)</span>}
        </label>
        <span style={{ fontSize: 12.5, color: "var(--ink-soft)", display: "flex", alignItems: "center", gap: 8 }}>
          {value.length > 0 ? (
            <>
              {single ? "Selecionado" : `Selecionados (${value.length})`}: <strong style={{ color: "var(--ink)" }}>{value.join(", ")}</strong>
              <button
                type="button"
                onClick={() => onChange([])}
                style={{ border: "none", background: "none", color: "var(--brand)", cursor: "pointer", fontSize: 12.5, padding: 0 }}
              >
                Limpar
              </button>
            </>
          ) : (
            "Nenhum selecionado (opcional)"
          )}
        </span>
      </div>

      <div className={odontoStyles.panel}>
        <div className={odontoStyles.regionList}>
          {REGIONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => toggle(r)}
              className={`${odontoStyles.regionChip} ${value.includes(r) ? odontoStyles.regionChipActive : ""}`}
            >
              {r}
            </button>
          ))}
        </div>

        <div className={odontoStyles.tabBar}>
          <button
            type="button"
            className={`${odontoStyles.tabBtn} ${tab === "permanent" ? odontoStyles.tabBtnActive : ""}`}
            onClick={() => setTab("permanent")}
          >
            Permanentes
          </button>
          <button
            type="button"
            className={`${odontoStyles.tabBtn} ${tab === "deciduous" ? odontoStyles.tabBtnActive : ""}`}
            onClick={() => setTab("deciduous")}
          >
            Decíduos
          </button>
        </div>

        <div className={odontoStyles.chart}>
          <div className={odontoStyles.row}>
            <div className={odontoStyles.quadrant}>
              {upperRight.map((n) => (
                <ToothButton key={n} number={n} selected={value.includes(n)} onClick={() => toggle(n)} />
              ))}
            </div>
            <div className={odontoStyles.midline} />
            <div className={odontoStyles.quadrant}>
              {upperLeft.map((n) => (
                <ToothButton key={n} number={n} selected={value.includes(n)} onClick={() => toggle(n)} />
              ))}
            </div>
          </div>
          <div className={odontoStyles.row}>
            <div className={odontoStyles.quadrant}>
              {lowerRight.map((n) => (
                <ToothButton key={n} number={n} selected={value.includes(n)} onClick={() => toggle(n)} />
              ))}
            </div>
            <div className={odontoStyles.midline} />
            <div className={odontoStyles.quadrant}>
              {lowerLeft.map((n) => (
                <ToothButton key={n} number={n} selected={value.includes(n)} onClick={() => toggle(n)} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
