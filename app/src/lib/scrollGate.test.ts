import { describe, expect, it } from "vitest";
import { hasScrolledToEnd } from "./scrollGate";

describe("hasScrolledToEnd", () => {
  it("conteúdo que cabe na caixa já conta como lido até o fim", () => {
    // Regressão: a evolução curta não transbordava a área de leitura, o
    // navegador nunca disparava 'scroll', e o paciente ficava com o botão
    // "Continuar para assinatura" desabilitado pra sempre — sem nada pra
    // rolar e sem como avançar.
    expect(hasScrolledToEnd({ scrollHeight: 300, scrollTop: 0, clientHeight: 300 })).toBe(true);
  });

  it("conteúdo longo ainda no topo não conta", () => {
    expect(hasScrolledToEnd({ scrollHeight: 900, scrollTop: 0, clientHeight: 340 })).toBe(false);
  });

  it("conteúdo longo rolado até o fim conta", () => {
    expect(hasScrolledToEnd({ scrollHeight: 900, scrollTop: 560, clientHeight: 340 })).toBe(true);
  });

  it("aceita parar um pouco antes do fim, dentro da tolerância", () => {
    expect(hasScrolledToEnd({ scrollHeight: 900, scrollTop: 545, clientHeight: 340 })).toBe(true);
  });

  it("não aceita parar longe do fim", () => {
    expect(hasScrolledToEnd({ scrollHeight: 900, scrollTop: 400, clientHeight: 340 })).toBe(false);
  });

  it("tolera as alturas fracionárias que o navegador devolve", () => {
    expect(hasScrolledToEnd({ scrollHeight: 900.5, scrollTop: 545.2, clientHeight: 340 })).toBe(true);
  });

  it("aguenta o overscroll elástico do iOS, que passa do fim", () => {
    expect(hasScrolledToEnd({ scrollHeight: 900, scrollTop: 600, clientHeight: 340 })).toBe(true);
  });

  it("respeita uma tolerância customizada", () => {
    const quase = { scrollHeight: 900, scrollTop: 530, clientHeight: 340 }; // faltam 30px
    expect(hasScrolledToEnd(quase)).toBe(false);
    expect(hasScrolledToEnd(quase, 40)).toBe(true);
  });
});
