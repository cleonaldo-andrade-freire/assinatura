import { describe, expect, it } from "vitest";
import { hasPrescriptionContent, isExamsOnly, prescriptionDocTitle } from "./prescriptionExams";
import type { PrescriptionItem } from "./database.types";

const med = (drug_name: string): PrescriptionItem => ({
  drug_name,
  dosage: "1 comprimido",
  instructions: "a cada 8h",
  generic_allowed: false,
  control_type: "comum",
});

describe("hasPrescriptionContent", () => {
  it("aceita quando há só medicamento", () => {
    expect(hasPrescriptionContent([med("Amoxicilina")], [])).toBe(true);
  });

  it("aceita quando há só exame", () => {
    expect(hasPrescriptionContent([], [{ name: "Hemograma completo" }])).toBe(true);
  });

  it("recusa quando não há nem medicamento nem exame", () => {
    expect(hasPrescriptionContent([], [])).toBe(false);
  });
});

describe("isExamsOnly", () => {
  it("é verdadeiro sem medicamento e com ao menos um exame", () => {
    expect(isExamsOnly({ items: [], exam_requests: [{ name: "Raio-X panorâmico" }] })).toBe(true);
  });

  it("é falso quando há medicamento junto", () => {
    expect(isExamsOnly({ items: [med("Amoxicilina")], exam_requests: [{ name: "Raio-X panorâmico" }] })).toBe(false);
  });

  it("é falso quando não há exame", () => {
    expect(isExamsOnly({ items: [], exam_requests: [] })).toBe(false);
  });
});

describe("prescriptionDocTitle", () => {
  it("vira 'Solicitação de Exames' quando o documento é só exame", () => {
    expect(prescriptionDocTitle({ items: [], exam_requests: [{ name: "Raio-X panorâmico" }] })).toBe(
      "Solicitação de Exames"
    );
  });

  it("continua 'Receituário Odontológico' quando há medicamento", () => {
    expect(prescriptionDocTitle({ items: [med("Amoxicilina")], exam_requests: [] })).toBe("Receituário Odontológico");
  });

  it("continua 'Receituário Odontológico' quando há medicamento e exame juntos", () => {
    expect(prescriptionDocTitle({ items: [med("Amoxicilina")], exam_requests: [{ name: "Raio-X" }] })).toBe(
      "Receituário Odontológico"
    );
  });
});
