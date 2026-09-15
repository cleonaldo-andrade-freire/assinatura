import { describe, expect, it } from "vitest";
import {
  addDaysToDateStr,
  addMonthsToDateStr,
  brDayRangeUtc,
  calculateAge,
  firstOfMonth,
  firstOfNextMonth,
  formatBRMonthLabel,
  formatDateOnlyBR,
  formatTimestampBR,
  mondayOfWeek,
  monthGridDays,
} from "./date";

describe("formatBRMonthLabel", () => {
  it("formata mês e ano a partir de 'YYYY-MM'", () => {
    expect(formatBRMonthLabel("2026-08")).toBe("agosto de 2026");
  });

  it("aceita 'YYYY-MM-DD' também, ignorando o dia", () => {
    expect(formatBRMonthLabel("2026-01-15")).toBe("janeiro de 2026");
  });

  it("não passa por Date/fuso — mesmo cuidado de formatDateOnlyBR", () => {
    expect(formatBRMonthLabel("2026-12")).toBe("dezembro de 2026");
  });
});

describe("addDaysToDateStr", () => {
  it("soma dias, inclusive atravessando o fim do mês", () => {
    expect(addDaysToDateStr("2026-08-30", 3)).toBe("2026-09-02");
  });

  it("subtrai dias com número negativo", () => {
    expect(addDaysToDateStr("2026-08-01", -1)).toBe("2026-07-31");
  });
});

describe("addMonthsToDateStr", () => {
  it("soma meses dentro do mesmo ano", () => {
    expect(addMonthsToDateStr("2026-08-13", 1)).toBe("2026-09-13");
  });

  it("vira o ano quando ultrapassa dezembro", () => {
    expect(addMonthsToDateStr("2026-08-13", 6)).toBe("2027-02-13");
  });

  it("arredonda pro último dia válido do mês de destino (31/01 + 1 mês)", () => {
    expect(addMonthsToDateStr("2026-01-31", 1)).toBe("2026-02-28");
  });

  it("respeita fevereiro bissexto", () => {
    expect(addMonthsToDateStr("2027-01-31", 13)).toBe("2028-02-29");
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

describe("firstOfMonth / firstOfNextMonth", () => {
  it("primeiro dia do mês corrente", () => {
    expect(firstOfMonth("2026-08-19")).toBe("2026-08-01");
  });

  it("primeiro dia do mês seguinte, inclusive virando o ano", () => {
    expect(firstOfNextMonth("2026-08-19")).toBe("2026-09-01");
    expect(firstOfNextMonth("2026-12-05")).toBe("2027-01-01");
  });
});

describe("calculateAge", () => {
  it("conta anos completos quando o aniversário já passou este ano", () => {
    expect(calculateAge("2000-03-10", "2026-08-19")).toBe(26);
  });

  it("ainda não soma o ano corrente quando o aniversário não chegou", () => {
    expect(calculateAge("2000-12-25", "2026-08-19")).toBe(25);
  });

  it("soma o ano no dia exato do aniversário", () => {
    expect(calculateAge("2000-08-19", "2026-08-19")).toBe(26);
  });

  it("zero no dia do nascimento", () => {
    expect(calculateAge("2026-08-19", "2026-08-19")).toBe(0);
  });
});

describe("monthGridDays", () => {
  it("começa numa segunda e termina num domingo", () => {
    const days = monthGridDays("2026-08-19");
    expect(new Date(`${days[0]}T12:00:00-03:00`).getUTCDay()).toBe(1);
    expect(new Date(`${days[days.length - 1]}T12:00:00-03:00`).getUTCDay()).toBe(0);
  });

  it("cobre o mês inteiro, do dia 1 ao último", () => {
    const days = monthGridDays("2026-08-19");
    expect(days).toContain("2026-08-01");
    expect(days).toContain("2026-08-31");
  });

  it("tamanho é sempre múltiplo de 7 (semanas completas)", () => {
    expect(monthGridDays("2026-08-19").length % 7).toBe(0);
    expect(monthGridDays("2026-02-10").length % 7).toBe(0);
  });
});

describe("formatTimestampBR", () => {
  it("usa o dia do Brasil, não o UTC, depois das 21h", () => {
    // Regressão: atestado emitido 21:30 de 15/09 vira 16/09T00:30Z no banco.
    // O PDF recortava a string ISO e imprimia 16/09 — um dia à frente da
    // tela do painel, no mesmo documento.
    expect(formatTimestampBR("2026-09-16T00:30:00.000Z")).toBe("15/09/2026");
  });

  it("vira o dia só às 21h de Brasília (00h UTC)", () => {
    expect(formatTimestampBR("2026-09-15T23:59:00-03:00")).toBe("15/09/2026");
    expect(formatTimestampBR("2026-09-16T00:00:00-03:00")).toBe("16/09/2026");
  });

  it("de dia, quando UTC e Brasil coincidem, não muda nada", () => {
    expect(formatTimestampBR("2026-09-15T14:00:00-03:00")).toBe("15/09/2026");
  });
});

describe("formatDateOnlyBR", () => {
  it("não desloca uma coluna DATE", () => {
    // Regressão: `new Date("2026-09-14")` é meia-noite UTC; formatado no fuso
    // do aparelho virava 13/09 na tela do paciente — errado o dia inteiro,
    // todo dia, não só depois das 21h.
    expect(formatDateOnlyBR("2026-09-14")).toBe("14/09/2026");
  });

  it("aguenta o primeiro e o último dia do ano sem escorregar", () => {
    expect(formatDateOnlyBR("2026-01-01")).toBe("01/01/2026");
    expect(formatDateOnlyBR("2026-12-31")).toBe("31/12/2026");
  });

  it("ignora hora se vier junto — a coluna é data, o resto é ruído", () => {
    expect(formatDateOnlyBR("2026-09-14T00:00:00.000Z")).toBe("14/09/2026");
  });
});
