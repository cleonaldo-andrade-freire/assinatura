"use client";

import { useState, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { PATIENT_TABS, STAFF_ALLOWED_TAB_KEYS, type PatientTabKey } from "@/lib/patientTabs";
import { PATIENT_TAB_ICONS } from "@/components/mobile/patientTabIcons";
import { useNarrowViewport } from "@/lib/useNarrowViewport";
import styles from "@/styles/shell.module.css";

/** Troca de aba client-side (sem recarregar a página) — os quatro painéis já
 * vêm prontos (renderizados no servidor) do componente pai; aqui só decide
 * qual mostrar. `initialTab` vem da URL (?tab=) pra sobreviver à paginação
 * dentro de uma aba (o link de "página 2" preserva a aba atual).
 *
 * A troca de aba também atualiza a URL (`router.replace`, sem empilhar
 * histórico) — sem isso, os links de paginação de cada painel (calculados
 * no servidor a partir do `?tab=` da URL no carregamento) ficavam presos na
 * aba com que a página abriu: clicar "página 2" depois de trocar de aba
 * aqui do lado do cliente te devolvia pra aba antiga. */
export function PatientTabs({
  initialTab,
  panels,
  role = "owner",
}: {
  initialTab: PatientTabKey;
  panels: Partial<Record<PatientTabKey, ReactNode>>;
  role?: "owner" | "staff";
}) {
  const router = useRouter();
  const pathname = usePathname();
  // Mesmo critério do R$ nos KPIs do Hoje (DashboardKPIs) — ≤900px cobre
  // celular e a faixa de tablet (768–900px, sidebar em rail de ícones),
  // não só o shell mobile v2. 8 abas em texto não cabem sem cortar
  // ("Prescrições" virava "P"); em ícone cabem todas, sem precisar de
  // scroll horizontal.
  const narrow = useNarrowViewport(900);
  const [active, setActive] = useState<PatientTabKey>(initialTab);
  const visibleTabs = role === "staff" ? PATIENT_TABS.filter((t) => STAFF_ALLOWED_TAB_KEYS.has(t.key)) : PATIENT_TABS;

  function selectTab(key: PatientTabKey) {
    setActive(key);
    router.replace(`${pathname}?tab=${key}`, { scroll: false });
  }

  return (
    <div className={styles.panel}>
      <div className={styles.tabBar}>
        {visibleTabs.map((t) => {
          const Icon = PATIENT_TAB_ICONS[t.key];
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => selectTab(t.key)}
              className={`${styles.tabBtn} ${active === t.key ? styles.tabBtnActive : ""}`}
              title={narrow ? t.label : undefined}
              aria-label={narrow ? t.label : undefined}
            >
              {narrow ? <Icon /> : t.label}
            </button>
          );
        })}
      </div>
      <div className={styles.panelBody}>{panels[active]}</div>
    </div>
  );
}
