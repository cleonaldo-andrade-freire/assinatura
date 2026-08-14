"use client";

import { useState, type ReactNode } from "react";
import { PATIENT_TABS, type PatientTabKey } from "@/lib/patientTabs";
import styles from "@/styles/shell.module.css";

/** Troca de aba client-side (sem recarregar a página) — os quatro painéis já
 * vêm prontos (renderizados no servidor) do componente pai; aqui só decide
 * qual mostrar. `initialTab` vem da URL (?tab=) pra sobreviver à paginação
 * dentro de uma aba (o link de "página 2" preserva a aba atual). */
export function PatientTabs({
  initialTab,
  panels,
}: {
  initialTab: PatientTabKey;
  panels: Record<PatientTabKey, ReactNode>;
}) {
  const [active, setActive] = useState<PatientTabKey>(initialTab);

  return (
    <div className={styles.panel}>
      <div className={styles.tabBar}>
        {PATIENT_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActive(t.key)}
            className={`${styles.tabBtn} ${active === t.key ? styles.tabBtnActive : ""}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className={styles.panelBody}>{panels[active]}</div>
    </div>
  );
}
