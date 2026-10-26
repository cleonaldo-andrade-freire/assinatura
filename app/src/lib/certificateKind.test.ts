import { describe, expect, it } from "vitest";
import { certificateReadyMessage, certificateSummary, certificateTitle, shiftLabel } from "./certificateKind";

describe("certificateKind", () => {
  it("rotula o turno", () => {
    expect(shiftLabel("manha")).toBe("Manhã");
    expect(shiftLabel(null)).toBe("");
  });

  it("título e mensagem mudam com o tipo", () => {
    expect(certificateTitle("comparecimento")).toBe("Declaração de Comparecimento");
    expect(certificateTitle("afastamento")).toBe("Atestado Odontológico");
    expect(certificateReadyMessage("comparecimento", "L")).toBe("📄 Sua declaração de comparecimento já está disponível: L");
    expect(certificateReadyMessage("afastamento", "L")).toBe("📄 Seu atestado odontológico já está disponível: L");
  });

  it("resume pra coluna das listas", () => {
    expect(certificateSummary({ kind: "comparecimento", shift: "tarde", rest_days: 0 })).toBe("Comparecimento — Tarde");
    expect(certificateSummary({ kind: "afastamento", shift: null, rest_days: 1 })).toBe("1 dia de afastamento");
    expect(certificateSummary({ kind: "afastamento", shift: null, rest_days: 3 })).toBe("3 dias de afastamento");
  });
});
