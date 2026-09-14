/** Medidas de rolagem de um elemento — o recorte de `HTMLElement` que interessa aqui. */
export interface ScrollMetrics {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
}

/**
 * O leitor chegou ao fim do texto? Sustenta o "leia até o final antes de
 * assinar" das telas de assinatura do paciente (evolução e termo de adesão).
 *
 * Cuidado principal: quando o conteúdo CABE na caixa, `scrollHeight` e
 * `clientHeight` são iguais e a conta dá 0 — ou seja, já está no fim. Isso
 * importa porque o navegador não dispara evento de `scroll` num elemento que
 * não tem o que rolar; se a tela só liberar o botão no `onScroll`, uma
 * evolução curta trava o paciente sem saída (foi exatamente o que aconteceu
 * em produção). Por isso quem chama precisa avaliar também depois que o
 * conteúdo renderiza, não só na rolagem.
 *
 * `tolerance` existe porque o navegador devolve alturas fracionárias e quase
 * nunca se para exatamente no último pixel; o overscroll elástico do iOS, que
 * deixa a conta negativa, também entra como "chegou ao fim".
 */
export function hasScrolledToEnd(m: ScrollMetrics, tolerance = 24): boolean {
  return m.scrollHeight - m.scrollTop - m.clientHeight < tolerance;
}
