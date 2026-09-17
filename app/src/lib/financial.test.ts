import { describe, expect, it } from "vitest";
import { buildMonthlySeries, chartMax, groupByCategory, monthlyDelta, niceTop, type MonthlyRow } from "./financial";

const rows: MonthlyRow[] = [
  { month: "2026-07-01", revenue_launched: "1000.00", expense_due: "400.00" },
  { month: "2026-09-01", revenue_launched: "2500.50", expense_due: "1200.25" },
];

describe("buildMonthlySeries", () => {
  it("preenche com zero o mês sem movimento, em vez de pular", () => {
    // Agosto não tem linha na view (nenhum lançamento). Se a série pulasse o
    // mês, o gráfico mostraria julho colado em setembro e esconderia o buraco
    // — que é justamente a informação relevante.
    const serie = buildMonthlySeries(rows, "2026-09", 3);
    expect(serie.map((p) => p.month)).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(serie[1]).toEqual({ month: "2026-08", revenue: 0, expense: 0 });
  });

  it("devolve exatamente a quantidade de meses pedida, terminando no mês de referência", () => {
    const serie = buildMonthlySeries(rows, "2026-09", 12);
    expect(serie).toHaveLength(12);
    expect(serie[0].month).toBe("2025-10");
    expect(serie[11].month).toBe("2026-09");
  });

  it("converte os numéricos que o Postgres devolve como string", () => {
    const serie = buildMonthlySeries(rows, "2026-09", 3);
    expect(serie[2]).toEqual({ month: "2026-09", revenue: 2500.5, expense: 1200.25 });
  });

  it("ignora mês fora da janela pedida", () => {
    const serie = buildMonthlySeries(rows, "2026-09", 2);
    expect(serie.map((p) => p.month)).toEqual(["2026-08", "2026-09"]);
    expect(serie.every((p) => p.month !== "2026-07")).toBe(true);
  });

  it("sem nenhuma linha, devolve a janela inteira zerada", () => {
    const serie = buildMonthlySeries([], "2026-09", 12);
    expect(serie).toHaveLength(12);
    expect(serie.every((p) => p.revenue === 0 && p.expense === 0)).toBe(true);
  });
});

describe("monthlyDelta", () => {
  it("calcula a variação percentual contra o mês anterior", () => {
    expect(monthlyDelta(1500, 1000)).toBe(50);
    expect(monthlyDelta(800, 1000)).toBe(-20);
  });

  it("devolve null quando o mês anterior foi zero — não existe variação de zero", () => {
    // Sem isso a conta vira Infinity e a tela mostraria "+∞%".
    expect(monthlyDelta(1000, 0)).toBeNull();
    expect(monthlyDelta(0, 0)).toBeNull();
  });

  it("zero contra um mês com valor é queda de 100%", () => {
    expect(monthlyDelta(0, 1000)).toBe(-100);
  });
});

describe("groupByCategory", () => {
  it("soma por categoria e ordena do maior pro menor", () => {
    const grupos = groupByCategory([
      { category: "Aluguel", amount: "3000" },
      { category: "Material", amount: "500" },
      { category: "Aluguel", amount: "200" },
    ]);
    expect(grupos).toEqual([
      { category: "Aluguel", total: 3200 },
      { category: "Material", total: 500 },
    ]);
  });

  it("despesa sem categoria vira 'Sem categoria' em vez de sumir", () => {
    const grupos = groupByCategory([
      { category: null, amount: "100" },
      { category: "", amount: "50" },
    ]);
    expect(grupos).toEqual([{ category: "Sem categoria", total: 150 }]);
  });

  it("lista vazia não quebra", () => {
    expect(groupByCategory([])).toEqual([]);
  });
});

describe("chartMax", () => {
  it("usa o maior valor da série", () => {
    expect(chartMax([10, 250, 90])).toBe(250);
  });

  it("série toda zerada devolve 1, não 0 — divisor zero viraria NaN na altura da barra", () => {
    expect(chartMax([0, 0, 0])).toBe(1);
    expect(chartMax([])).toBe(1);
  });

  it("valores todos iguais não achatam o gráfico", () => {
    expect(chartMax([500, 500, 500])).toBe(500);
  });
});

describe("niceTop", () => {
  it("arredonda o teto do eixo pra cima, em passo redondo", () => {
    expect(niceTop(1234)).toBe(2000);
    expect(niceTop(950)).toBe(1000);
    expect(niceTop(4200)).toBe(5000);
  });

  it("nunca corta o maior valor da série", () => {
    for (const v of [1, 7, 99, 101, 3333, 88888]) {
      expect(niceTop(v)).toBeGreaterThanOrEqual(v);
    }
  });

  it("zero e valor inválido devolvem 1 — teto zero viraria divisão por zero", () => {
    expect(niceTop(0)).toBe(1);
    expect(niceTop(Number.NaN)).toBe(1);
  });
});
