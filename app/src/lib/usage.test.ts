import { describe, expect, it } from "vitest";
import { overageUnits } from "./usage";

const starter = { monthly_limit: 20 };
const basic = { monthly_limit: 40 };
const pro = { monthly_limit: 120 };
const enterprise = { monthly_limit: 200 };

describe("overageUnits", () => {
  it("retorna 0 quando o uso está dentro do limite do plano", () => {
    expect(overageUnits(15, starter)).toBe(0);
    expect(overageUnits(20, starter)).toBe(0);
  });

  it("retorna quantas unidades passaram do limite", () => {
    expect(overageUnits(23, starter)).toBe(3);
    expect(overageUnits(125, pro)).toBe(5);
  });

  it("cada plano tem seu próprio limite", () => {
    expect(overageUnits(25, basic)).toBe(0); // limite 40
    expect(overageUnits(25, starter)).toBe(5); // limite 20
    expect(overageUnits(25, enterprise)).toBe(0); // limite 200
  });
});
