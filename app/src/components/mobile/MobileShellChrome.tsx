"use client";

import type { ReactNode } from "react";
import { MobileHeader } from "./MobileHeader";
import { MobileTabBar } from "./MobileTabBar";
import shellStyles from "@/styles/shell.module.css";
import mobileStyles from "@/styles/shellMobileV2.module.css";

/**
 * Ponto único de entrada do chrome mobile v2 (header + área de conteúdo +
 * tab bar), importado de ClinicShell.tsx só via `next/dynamic` — mantém
 * shell.module.css/shellMobileV2.module.css e os componentes mobile fora do
 * bundle de quem nunca renderiza isso (flag desligada, staff, ou desktop).
 * A tab bar é `position: fixed`, então não importa que ela esteja aninhada
 * dentro de `.main` no DOM — sai do fluxo normal como se fosse irmã dele.
 */
export function MobileShellChrome({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <>
      <MobileHeader title={title} actions={actions} />
      <div className={`${shellStyles.content} ${mobileStyles.contentMobileV2}`}>{children}</div>
      <MobileTabBar />
    </>
  );
}
