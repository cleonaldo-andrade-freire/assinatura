"use client";

import { useState } from "react";
import { chartMax, monthlyDelta, niceTop, type MonthlyPoint } from "@/lib/financial";
import { formatBRMonthLabel } from "@/lib/date";
import { formatMoneyDisplay } from "@/lib/money";
import styles from "@/styles/shell.module.css";
import chart from "./chart.module.css";

/**
 * Receita e despesa lançadas, mês a mês, em barras agrupadas.
 *
 * Azul e laranja, não verde e vermelho: o par verde/vermelho é o mais intuitivo
 * para dinheiro e o pior para daltonismo — sob protanopia a separação entre o
 * verde da marca e o vermelho de alerta fica em ΔE 5,1, ou seja, as duas séries
 * viram a mesma cor. Azul/laranja mede ΔE 24,7 no mesmo teste. Além da cor, a
 * identidade também vem da legenda, da posição fixa (receita sempre à esquerda
 * no par) e da tabela — nunca só do matiz.
 *
 * Não há linha de saldo sobreposta: com as barras lado a lado, o mês negativo
 * já é o mês em que a barra de despesa passa a de receita. A linha repetiria
 * isso e obrigaria o eixo a descer abaixo de zero, achatando as barras.
 */
const BAND = 64; // largura reservada por mês
const BAR = 22; // <= 24px por spec; o resto da banda é ar
const GAP = 2; // respiro de superfície entre as duas barras do par
const PLOT_H = 190;
const AXIS_W = 62;
const XAXIS_H = 26;
const TOP_PAD = 10;

function shortMonth(month: string): string {
  const label = formatBRMonthLabel(month); // "agosto de 2026"
  const [nome, , ano] = label.split(" ");
  return `${nome.slice(0, 3)}/${ano.slice(2)}`;
}

function compact(v: number): string {
  if (v >= 1000) return `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

export function MonthlyBarsChart({ series }: { series: MonthlyPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  const top = niceTop(chartMax(series.flatMap((p) => [p.revenue, p.expense])));
  const plotW = series.length * BAND;
  const width = AXIS_W + plotW;
  const height = TOP_PAD + PLOT_H + XAXIS_H;
  const y = (v: number) => TOP_PAD + PLOT_H - (v / top) * PLOT_H;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * top);

  const ponto = hover === null ? null : series[hover];
  const saldo = ponto ? ponto.revenue - ponto.expense : 0;

  return (
    <div>
      <div className={chart.legend}>
        <span className={chart.legendItem}>
          <span className={chart.swatch} style={{ background: "var(--chart-revenue)" }} aria-hidden="true" />
          Receita lançada
        </span>
        <span className={chart.legendItem}>
          <span className={chart.swatch} style={{ background: "var(--chart-expense)" }} aria-hidden="true" />
          Despesa do mês
        </span>
      </div>

      {/* Rola de lado dentro do próprio contêiner: 12 meses não cabem num
          celular, e deixar a PÁGINA rolar de lado quebraria o resto da tela. */}
      <div className={chart.scroller}>
        <div style={{ position: "relative", width, minWidth: width }}>
          <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={`Receita e despesa por mês, dos últimos ${series.length} meses. Os valores estão na tabela abaixo do gráfico.`}
          >
            {ticks.map((t) => (
              <g key={t}>
                {/* Grade em hairline sólido, um passo de cor acima da superfície:
                    referência sem competir com os dados. Tracejado, não — lê
                    como "projeção" quando é só grade. */}
                <line x1={AXIS_W} x2={width} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth="1" />
                <text x={AXIS_W - 8} y={y(t) + 4} textAnchor="end" className={chart.axisText}>
                  {compact(t)}
                </text>
              </g>
            ))}

            {series.map((p, i) => {
              const x0 = AXIS_W + i * BAND;
              const parX = x0 + (BAND - (BAR * 2 + GAP)) / 2;
              const base = y(0);
              return (
                <g key={p.month}>
                  <Bar x={parX} yTop={y(p.revenue)} base={base} fill="var(--chart-revenue)" />
                  <Bar x={parX + BAR + GAP} yTop={y(p.expense)} base={base} fill="var(--chart-expense)" />
                  <text x={x0 + BAND / 2} y={height - 8} textAnchor="middle" className={chart.axisText}>
                    {shortMonth(p.month)}
                  </text>
                  {/* Alvo de mouse da banda inteira — bem maior que as barras,
                      que é o que torna o hover utilizável com valores baixos. */}
                  <rect
                    x={x0}
                    y={TOP_PAD}
                    width={BAND}
                    height={PLOT_H}
                    fill="transparent"
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover((h) => (h === i ? null : h))}
                  />
                </g>
              );
            })}

            <line x1={AXIS_W} x2={width} y1={y(0)} y2={y(0)} stroke="var(--ink-faint)" strokeWidth="1" />
          </svg>

          {ponto && (
            <div
              className={chart.tooltip}
              style={{ left: AXIS_W + (hover! + 0.5) * BAND, top: TOP_PAD }}
              role="status"
            >
              <strong>{formatBRMonthLabel(ponto.month)}</strong>
              <span>Receita lançada: R$ {formatMoneyDisplay(ponto.revenue)}</span>
              <span>Despesa do mês: R$ {formatMoneyDisplay(ponto.expense)}</span>
              <span className={saldo < 0 ? chart.negative : undefined}>
                Saldo: {saldo < 0 ? "−" : ""}R$ {formatMoneyDisplay(Math.abs(saldo))}
              </span>
            </div>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowTable((v) => !v)}
        className={`${styles.btn} ${styles.btnGhost}`}
        style={{ fontSize: 12.5, marginTop: 10 }}
        aria-expanded={showTable}
      >
        {showTable ? "▾" : "▸"} Ver os números
      </button>

      {showTable && (
        <div className={chart.scroller} style={{ marginTop: 8 }}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Mês</th>
                <th>Receita lançada</th>
                <th>Despesa do mês</th>
                <th>Saldo</th>
              </tr>
            </thead>
            <tbody>
              {series.map((p) => {
                const s = p.revenue - p.expense;
                return (
                  <tr key={p.month}>
                    <td>{formatBRMonthLabel(p.month)}</td>
                    <td>R$ {formatMoneyDisplay(p.revenue)}</td>
                    <td>R$ {formatMoneyDisplay(p.expense)}</td>
                    <td className={s < 0 ? chart.negative : undefined}>
                      {s < 0 ? "−" : ""}R$ {formatMoneyDisplay(Math.abs(s))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Barra com o topo arredondado e a base quadrada, cravada na linha do zero. */
function Bar({ x, yTop, base, fill }: { x: number; yTop: number; base: number; fill: string }) {
  const h = Math.max(0, base - yTop);
  if (h === 0) return null;
  const r = Math.min(4, h);
  return (
    <path
      d={`M ${x} ${base} L ${x} ${yTop + r} Q ${x} ${yTop} ${x + r} ${yTop} L ${x + BAR - r} ${yTop} Q ${x + BAR} ${yTop} ${x + BAR} ${yTop + r} L ${x + BAR} ${base} Z`}
      fill={fill}
    />
  );
}

export { monthlyDelta };
