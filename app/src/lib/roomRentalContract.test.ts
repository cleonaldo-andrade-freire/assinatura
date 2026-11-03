import { describe, expect, it } from "vitest";
import { contractClauses, contractShiftLabel, contractWhatsappMessage, lessorLine, partyLine, type RentalContractSnapshot } from "./roomRentalContract";

const snapshot: RentalContractSnapshot = {
  schema: "contrato-locacao/v1",
  lessor: { clinicName: "Clínica Sorriso", dentistName: "Dra. Ana Lima", cro: "1234", croUf: "PE", cnpj: "12345678000195", address: "Rua A, 10 — Recife/PE" },
  tenant: { name: "Carlos Souza Neto", document: "52998224725", cro: "9876", croUf: "PE" },
  rental: { date: "2026-11-10", shiftName: "Tarde", startTime: "14:00", endTime: "18:00", amount: 150 },
};

describe("contrato de locação", () => {
  it("põe dia, turno, valor e endereço no objeto e no valor", () => {
    const text = contractClauses(snapshot)
      .flatMap((c) => c.paragraphs)
      .join(" ");
    expect(text).toContain("10/11/2026");
    expect(text).toContain("Tarde (14:00 às 18:00)");
    expect(text).toContain("R$ 150,00");
    expect(text).toContain("Rua A, 10");
  });

  it("tem as cláusulas de cuidado com a sala", () => {
    const text = contractClauses(snapshot)
      .flatMap((c) => c.paragraphs)
      .join(" ");
    expect(text).toMatch(/proibido usar materiais/);
    expect(text).toMatch(/limpa, organizada e em condições de uso/);
    expect(text).toMatch(/lixo gerado/);
    expect(text).toMatch(/conserto/);
    expect(text).toMatch(/disjuntores e fechar o registro de água/);
  });

  it("qualifica as partes com CPF/CNPJ e CRO", () => {
    expect(partyLine("Carlos", "52998224725", "9876", "PE")).toBe("Carlos, CPF 529.982.247-25, CRO 9876/PE");
    expect(partyLine("Carlos", null, null, null)).toBe("Carlos");
    expect(lessorLine(snapshot.lessor)).toBe("Dra. Ana Lima (Clínica Sorriso), CNPJ 12.345.678/0001-95, CRO 1234/PE");
  });

  it("monta a mensagem do WhatsApp com primeiro nome, dia, turno, valor e link", () => {
    const msg = contractWhatsappMessage(snapshot, "https://app/contrato-locacao/abc");
    expect(msg).toContain("Olá, Carlos!");
    expect(msg).toContain("10/11/2026 · Tarde (14:00 às 18:00)");
    expect(msg).toContain("R$ 150,00");
    expect(msg).toContain("https://app/contrato-locacao/abc");
    expect(contractShiftLabel(snapshot.rental)).toBe("Tarde (14:00 às 18:00)");
  });
});
