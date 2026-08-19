"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { ActionSheet } from "./ActionSheet";
import { HomeIcon, AgendaIcon, PatientsIcon, DocumentsIcon, PlusIcon } from "./icons";
import styles from "@/styles/shellMobileV2.module.css";

const TABS = [
  { href: "/dashboard", label: "Hoje", icon: HomeIcon },
  { href: "/dashboard/agenda", label: "Agenda", icon: AgendaIcon },
] as const;

const TABS_AFTER_PLUS = [
  { href: "/dashboard/pacientes", label: "Pacientes", icon: PatientsIcon },
  { href: "/dashboard/documentos", label: "Documentos", icon: DocumentsIcon },
] as const;

/**
 * Tab bar fixa do shell mobile v2 (Hoje · Agenda · [+] · Pacientes ·
 * Documentos — prompt §5). Só montada quando ClinicShell já resolveu
 * role === "owner" + viewport mobile, então não precisa repetir essa
 * checagem aqui.
 */
export function MobileTabBar() {
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);

  function isActive(href: string) {
    return href === "/dashboard" ? pathname === "/dashboard" : (pathname?.startsWith(href) ?? false);
  }

  function renderTab(item: { href: string; label: string; icon: () => JSX.Element }) {
    const Icon = item.icon;
    const active = isActive(item.href);
    return (
      <a key={item.href} href={item.href} className={`${styles.tabLink} ${active ? styles.tabLinkActive : ""}`} aria-current={active ? "page" : undefined}>
        <Icon />
        <span className={styles.tabLabel}>{item.label}</span>
      </a>
    );
  }

  return (
    <>
      <nav className={styles.tabBar} aria-label="Navegação principal">
        {TABS.map(renderTab)}
        <div className={styles.tabPlusWrap}>
          <button
            type="button"
            className={styles.tabPlus}
            onClick={() => setSheetOpen(true)}
            aria-label="Ações rápidas: novo agendamento, paciente, anamnese, atestado ou prescrição"
          >
            <PlusIcon />
          </button>
        </div>
        {TABS_AFTER_PLUS.map(renderTab)}
      </nav>
      <ActionSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  );
}
