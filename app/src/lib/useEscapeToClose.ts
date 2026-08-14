import { useEffect } from "react";

/**
 * Fecha o modal com Esc — comportamento padrão de todo modal do projeto.
 * Passa `enabled: false` (em vez de omitir a chamada) quando um modal
 * aninhado por cima já trata o Esc: os dois listeners ficariam ativos ao
 * mesmo tempo e um Esc pra fechar só o de cima fecharia os dois juntos.
 */
export function useEscapeToClose(onClose: () => void, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, onClose]);
}
