import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { buildRentalContractPdf } from "./roomRentalContractPdf";
import type { RentalContractSnapshot } from "./roomRentalContract";

// PNG 1x1 transparente.
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const snapshot: RentalContractSnapshot = {
  schema: "contrato-locacao/v1",
  lessor: { clinicName: "Clínica Sorriso", dentistName: "Dra. Ana Lima", cro: "1234", croUf: "PE", cnpj: null, address: "Rua São João, 10 — Recife/PE" },
  tenant: { name: "Carlos Souza", document: "52998224725", cro: null, croUf: null },
  rental: { date: "2026-11-10", shiftName: "Tarde", startTime: "14:00", endTime: "18:00", amount: 150 },
};

describe("PDF do contrato de locação", () => {
  it("gera um PDF válido com acentos e a assinatura", async () => {
    const bytes = await buildRentalContractPdf(snapshot, { signedAt: "2026-11-04T13:00:00Z", dataUrl: PNG, ip: "1.2.3.4", contentHash: "abc" });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });
});
