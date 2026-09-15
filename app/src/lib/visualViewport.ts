/** O recorte de `window.visualViewport` que interessa aqui. */
export interface VisualViewportLike {
  offsetLeft: number;
  offsetTop: number;
  width: number;
  height: number;
}

export interface ViewportInset {
  left: number;
  width: number;
  bottom: number;
}

/**
 * Onde ancorar a barra de ação fixa para que ela acompanhe a área realmente
 * visível da tela.
 *
 * O navegador tem duas viewports: a de *layout*, que não muda, e a *visual*,
 * que encolhe quando a pessoa dá zoom com a pinça ou quando o teclado abre.
 * `position: fixed` se ancora na de layout — então, com zoom, a barra continua
 * com a largura original e sobra para fora da tela, cortando os botões nas
 * duas bordas (foi o que apareceu no iOS). Aplicando estes valores, ela passa
 * a seguir a viewport visual.
 *
 * `bottom` é medido a partir da borda inferior da viewport de layout, que é a
 * referência do `position: fixed`; por isso entra a altura da tela.
 */
export function computeViewportInset(vv: VisualViewportLike, layoutHeight: number): ViewportInset {
  return {
    left: Math.round(vv.offsetLeft),
    width: Math.round(vv.width),
    // Trava em 0: durante o overscroll elástico do iOS a conta fica negativa
    // e a barra escorregaria pra fora da tela junto com o repique.
    bottom: Math.max(0, Math.round(layoutHeight - (vv.offsetTop + vv.height))),
  };
}
