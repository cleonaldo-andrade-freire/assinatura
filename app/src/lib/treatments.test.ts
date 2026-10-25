import { describe, expect, it } from "vitest";
import { buildVisitText } from "./treatments";

describe("buildVisitText", () => {
  const canal = { treatment_name: "Canal", tooth_region: "36" };
  const limpeza = { treatment_name: "Limpeza", tooth_region: null };

  it("usa o texto de finalização quando a sessão encerra os tratamentos", () => {
    expect(buildVisitText([canal, limpeza], true)).toBe("Canal do dente 36, Limpeza foram finalizados");
  });

  it("registra só a sessão quando o tratamento continua", () => {
    expect(buildVisitText([canal], false)).toBe("Sessão de Canal do dente 36");
  });

  it("fica vazio sem tratamento selecionado", () => {
    expect(buildVisitText([], true)).toBe("");
  });
});
