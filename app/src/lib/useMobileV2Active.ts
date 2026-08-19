"use client";

import { useEffect, useState } from "react";
import { isMobileV2Enabled } from "@/lib/mobileV2";

const MOBILE_VIEWPORT_QUERY = "(max-width: 767px)";

/**
 * True só quando a flag do shell mobile v2 está ligada E a viewport atual é
 * mobile — mesmo critério de ClinicShell.tsx (não duplicado ali por
 * enquanto: esse componente já tem seu próprio efeito com o prop `role`
 * embutido, e não vale reabrir um arquivo já verificado só por reuso).
 * Usado por formulários compartilhados (desktop + mobile) que precisam de
 * um comportamento extra só na versão mobile — ex.: rascunho automático
 * (useDraftAutosave) — sem depender de prop vinda do shell. Sempre false no
 * primeiro render (servidor e cliente); corrigido depois do mount via
 * matchMedia, nunca por user-agent.
 */
export function useMobileV2Active(): boolean {
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!isMobileV2Enabled()) return;
    const mq = window.matchMedia(MOBILE_VIEWPORT_QUERY);
    const update = () => setActive(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return active;
}
