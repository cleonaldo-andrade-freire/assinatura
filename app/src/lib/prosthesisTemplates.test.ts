import { describe, expect, it } from "vitest";
import { DEFAULT_STAGE_TEMPLATE_BODY, PROSTHESIS_STAGE_LABEL, PROSTHESIS_STAGES } from "./prosthesisTemplates";

const KNOWN_VARS = new Set(["paciente_nome", "clinica_nome", "descricao_protese", "estagio", "data_prevista"]);

describe("PROSTHESIS_STAGES / PROSTHESIS_STAGE_LABEL", () => {
  it("todo estágio tem um rótulo", () => {
    for (const stage of PROSTHESIS_STAGES) {
      expect(PROSTHESIS_STAGE_LABEL[stage]).toBeTruthy();
    }
  });
});

describe("DEFAULT_STAGE_TEMPLATE_BODY", () => {
  it("tem um texto padrão pra cada estágio, e só usa variáveis conhecidas", () => {
    for (const stage of PROSTHESIS_STAGES) {
      const body = DEFAULT_STAGE_TEMPLATE_BODY[stage];
      expect(body).toBeTruthy();
      const usedKeys = [...body.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)].map((m) => m[1]);
      for (const key of usedKeys) {
        expect(KNOWN_VARS.has(key)).toBe(true);
      }
    }
  });
});
