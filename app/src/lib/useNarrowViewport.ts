"use client";

import { useEffect, useState } from "react";

/**
 * True quando a viewport é ≤ maxWidth — independente da flag do shell
 * mobile v2. Usado por simplificações visuais que fazem sentido em
 * qualquer tela estreita (celular OU janela de navegador redimensionada
 * na faixa de tablet, 768–900px, onde a sidebar já vira rail de ícones),
 * não só quando o shell mobile v2 está ativo. Sempre false no primeiro
 * render (servidor e cliente) — corrigido depois do mount via matchMedia.
 */
export function useNarrowViewport(maxWidth: number): boolean {
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [maxWidth]);

  return narrow;
}
