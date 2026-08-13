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
 * Seletor de dente/região pra cada linha de tratamento do orçamento —
 * odontograma completo (permanentes + decíduos, notação FDI), sem a aba HOF
 * (fora de escopo por decisão explícita). Cada dente/região vira um valor de
 * texto simples (ex.: "11" ou "Arcada Superior"), igual ao campo que o
 * orçamento salva por linha.
 */
export function ToothRegionSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("permanent");
  const [search, setSearch] = useState("");

  function pick(v: string) {
    onChange(v);
    setOpen(false);
    setSearch("");
  }

  const upperRight = tab === "permanent" ? PERMANENT_UPPER_RIGHT : DECIDUOUS_UPPER_RIGHT;
  const upperLeft = tab === "permanent" ? PERMANENT_UPPER_LEFT : DECIDUOUS_UPPER_LEFT;
  const lowerRight = tab === "permanent" ? PERMANENT_LOWER_RIGHT : DECIDUOUS_LOWER_RIGHT;
  const lowerLeft = tab === "permanent" ? PERMANENT_LOWER_LEFT : DECIDUOUS_LOWER_LEFT;

  const filteredRegions = search.trim() ? REGIONS.filter((r) => r.toLowerCase().includes(search.trim().toLowerCase())) : REGIONS;

  return (
    <div className={odontoStyles.wrap}>
      <label className={styles.label}>Selecionar dente/região</label>
      <input
        type="text"
        className={styles.input}
        value={open ? search : value}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setSearch(e.target.value);
          setOpen(true);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Inserir dente…"
        autoComplete="off"
      />

      {open && (
        <div className={odontoStyles.panel} onMouseDown={(e) => e.preventDefault()}>
          {filteredRegions.length > 0 && (
            <div className={odontoStyles.regionList}>
              {filteredRegions.map((r) => (
                <button key={r} type="button" className={odontoStyles.regionItem} onClick={() => pick(r)}>
                  {r}
                </button>
              ))}
            </div>
          )}

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
                  <ToothButton key={n} number={n} selected={value === n} onClick={() => pick(n)} />
                ))}
              </div>
              <div className={odontoStyles.midline} />
              <div className={odontoStyles.quadrant}>
                {upperLeft.map((n) => (
                  <ToothButton key={n} number={n} selected={value === n} onClick={() => pick(n)} />
                ))}
              </div>
            </div>
            <div className={odontoStyles.row}>
              <div className={odontoStyles.quadrant}>
                {lowerRight.map((n) => (
                  <ToothButton key={n} number={n} selected={value === n} onClick={() => pick(n)} />
                ))}
              </div>
              <div className={odontoStyles.midline} />
              <div className={odontoStyles.quadrant}>
                {lowerLeft.map((n) => (
                  <ToothButton key={n} number={n} selected={value === n} onClick={() => pick(n)} />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
