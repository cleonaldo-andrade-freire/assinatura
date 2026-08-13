import { describe, expect, it } from "vitest";
import { addDaysToDateStr, brDayRangeUtc, mondayOfWeek } from "./date";

describe("addDaysToDateStr", () => {
  it("soma dias, inclusive atravessando o fim do mês", () => {
    expect(addDaysToDateStr("2026-08-30", 3)).toBe("2026-09-02");
  });

  it("subtrai dias com número negativo", () => {
    expect(addDaysToDateStr("2026-08-01", -1)).toBe("2026-07-31");
  });
});

describe("mondayOfWeek", () => {
  it("retorna a própria data se já for segunda", () => {
    // 2026-08-10 é uma segunda-feira.
    expect(mondayOfWeek("2026-08-10")).toBe("2026-08-10");
  });

  it("volta pra segunda-feira anterior num dia de meio de semana", () => {
    // 2026-08-13 é quinta-feira.
    expect(mondayOfWeek("2026-08-13")).toBe("2026-08-10");
  });

  it("trata domingo como fim da semana anterior, não início", () => {
    // 2026-08-16 é domingo — segunda-feira daquela semana é 2026-08-10.
    expect(mondayOfWeek("2026-08-16")).toBe("2026-08-10");
  });
});

describe("brDayRangeUtc", () => {
  it("meia-noite no Brasil (-03:00) vira 03:00 UTC", () => {
    const { fromIso, toIso } = brDayRangeUtc("2026-08-12");
    expect(fromIso).toBe("2026-08-12T03:00:00.000Z");
    expect(toIso).toBe("2026-08-13T03:00:00.000Z");
  });
});
