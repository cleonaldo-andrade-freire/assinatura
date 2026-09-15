import { describe, expect, it } from "vitest";
import { computeViewportInset } from "./visualViewport";

const TELA = 844; // altura da viewport de layout, em px de CSS

describe("computeViewportInset", () => {
  it("sem zoom e sem teclado, a barra fica colada na borda, largura cheia", () => {
    const inset = computeViewportInset({ offsetLeft: 0, offsetTop: 0, width: 390, height: TELA }, TELA);
    expect(inset).toEqual({ left: 0, width: 390, bottom: 0 });
  });

  it("com zoom, acompanha a área visível em vez de transbordar a tela", () => {
    // Regressão: barra fixa é dimensionada pela viewport de LAYOUT, então com
    // zoom ela continuava com 390px enquanto só ~328px estavam visíveis — os
    // dois botões apareciam cortados nas bordas.
    const inset = computeViewportInset({ offsetLeft: 31, offsetTop: 0, width: 328, height: 709 }, TELA);
    expect(inset.left).toBe(31);
    expect(inset.width).toBe(328);
  });

  it("com o teclado aberto, sobe pra ficar acima dele", () => {
    const inset = computeViewportInset({ offsetLeft: 0, offsetTop: 0, width: 390, height: 500 }, TELA);
    expect(inset.bottom).toBe(344);
  });

  it("com zoom e a página deslocada pra baixo, ancora no fim do que se vê", () => {
    const inset = computeViewportInset({ offsetLeft: 0, offsetTop: 100, width: 390, height: 700 }, TELA);
    expect(inset.bottom).toBe(44);
  });

  it("não deixa a barra sair da tela no overscroll elástico do iOS", () => {
    // Durante o rubber-band a conta fica negativa; sem travar em 0 a barra
    // escorregaria pra fora da tela junto com o repique.
    const inset = computeViewportInset({ offsetLeft: 0, offsetTop: 200, width: 390, height: 800 }, TELA);
    expect(inset.bottom).toBe(0);
  });

  it("arredonda pra px inteiro — meio pixel vira fresta clara sobre o conteúdo", () => {
    const inset = computeViewportInset({ offsetLeft: 30.4, offsetTop: 0, width: 328.7, height: 709.2 }, TELA);
    expect(Number.isInteger(inset.left)).toBe(true);
    expect(Number.isInteger(inset.width)).toBe(true);
    expect(Number.isInteger(inset.bottom)).toBe(true);
  });
});
