"use client";

import { useRouter, usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { BackIcon } from "./icons";
import styles from "@/styles/shellMobileV2.module.css";

// As 4 raízes de tab — nelas não faz sentido um botão de voltar (não há
// "de onde" voltar dentro da navegação em pilha do app). Qualquer outra
// rota (ficha do paciente, detalhe de anamnese, wizard) ganha o botão.
const TAB_ROOT_PATHS = new Set(["/dashboard", "/dashboard/agenda", "/dashboard/pacientes", "/dashboard/documentos"]);

/**
 * Header contextual do shell mobile v2 (prompt §5): título, voltar à
 * esquerda quando faz sentido, no máximo uma ação à direita.
 */
export function MobileHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const showBack = pathname ? !TAB_ROOT_PATHS.has(pathname) : false;

  return (
    <header className={styles.header}>
      {showBack ? (
        <button type="button" className={styles.headerBack} onClick={() => router.back()} aria-label="Voltar">
          <BackIcon />
        </button>
      ) : (
        <span className={styles.headerSpacer} aria-hidden="true" />
      )}
      <h1 className={styles.headerTitle}>{title}</h1>
      <div className={styles.headerActions}>{actions}</div>
    </header>
  );
}
