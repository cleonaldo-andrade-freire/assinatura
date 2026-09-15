"use client";

import { useEffect } from "react";
import { computeViewportInset } from "@/lib/visualViewport";

/**
 * Mantém a barra de ação (`.sticky-actions`) colada na área visível da tela,
 * e não na viewport de layout — que é onde `position: fixed` se ancora por
 * padrão e o motivo de os botões aparecerem cortados nas bordas quando o
 * paciente dá zoom com a pinça no iOS.
 *
 * Publica as medidas como variáveis CSS no `<html>`; o `globals.css` as
 * consome com valor de reserva, então em navegador sem `visualViewport` (ou
 * antes deste efeito rodar) a barra fica exatamente como era.
 *
 * Monte uma vez por página que use `.sticky-actions`.
 */
export function StickyActionsViewport() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const root = document.documentElement;
    const apply = () => {
      const { left, width, bottom } = computeViewportInset(vv, root.clientHeight);
      root.style.setProperty("--action-bar-left", `${left}px`);
      root.style.setProperty("--action-bar-width", `${width}px`);
      root.style.setProperty("--action-bar-bottom", `${bottom}px`);
    };

    apply();
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    return () => {
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
      root.style.removeProperty("--action-bar-left");
      root.style.removeProperty("--action-bar-width");
      root.style.removeProperty("--action-bar-bottom");
    };
  }, []);

  return null;
}
