import { describe, expect, it } from "vitest";
import { DEFAULT_TEMPLATE_BODY, resolveTemplate, TEMPLATE_TYPES, TEMPLATE_VARIABLES } from "./appointmentTemplates";

describe("resolveTemplate", () => {
  it("substitui variáveis conhecidas", () => {
    expect(resolveTemplate("Olá {{paciente_nome}}, {{hora_consulta}}", { paciente_nome: "Ana", hora_consulta: "10:00" })).toBe(
      "Olá Ana, 10:00"
    );
  });

  it("variável sem valor vira string vazia, não aparece o {{token}} literal", () => {
    expect(resolveTemplate("Endereço: {{endereco_clinica}}", {})).toBe("Endereço: ");
  });

  it("tolera espaço dentro das chaves ({{ x }})", () => {
    expect(resolveTemplate("{{ paciente_nome }}", { paciente_nome: "Ana" })).toBe("Ana");
  });

  it("texto sem nenhuma variável passa direto", () => {
    expect(resolveTemplate("Tudo bem, cancelado.", {})).toBe("Tudo bem, cancelado.");
  });
});

describe("DEFAULT_TEMPLATE_BODY", () => {
  it("tem um texto padrão pra cada tipo de modelo, e só usa variáveis que existem em TEMPLATE_VARIABLES", () => {
    const knownKeys = new Set(TEMPLATE_VARIABLES.map((v) => v.key));
    for (const type of TEMPLATE_TYPES) {
      const body = DEFAULT_TEMPLATE_BODY[type];
      expect(body).toBeTruthy();
      const usedKeys = [...body.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)].map((m) => m[1]);
      for (const key of usedKeys) {
        expect(knownKeys.has(key)).toBe(true);
      }
    }
  });
});
