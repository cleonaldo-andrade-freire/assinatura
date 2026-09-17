import { monthlyDelta } from "@/lib/financial";
import { formatMoneyDisplay } from "@/lib/money";
import styles from "@/styles/shell.module.css";
import chart from "./chart.module.css";

/**
 * Os números do mês, sem gráfico — é o que responde "como foi o mês" em dois
 * segundos. Gráfico é para comparar 12 meses; para três números do mês atual,
 * uma barra ou uma pizza só atrapalharia.
 *
 * "Receita lançada", nunca "recebido": o regime é de competência, então um
 * tratamento lançado e ainda não pago já conta aqui. Por isso "a receber"
 * aparece ao lado — sem ele, a diferença entre produção e caixa vira suspeita
 * de erro no sistema.
 */
function Delta({ current, previous }: { current: number; previous: number }) {
  const pct = monthlyDelta(current, previous);
  if (pct === null) {
    return <span className={chart.catValue}>sem base de comparação</span>;
  }
  const rounded = Math.round(pct);
  return (
    <span className={chart.catValue}>
      {rounded > 0 ? "+" : ""}
      {rounded}% vs. mês anterior
    </span>
  );
}

export function FinancialSummary({
  monthLabel,
  revenue,
  expense,
  prevRevenue,
  prevExpense,
  receivable,
}: {
  monthLabel: string;
  revenue: number;
  expense: number;
  prevRevenue: number;
  prevExpense: number;
  receivable: number;
}) {
  const saldo = revenue - expense;

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <p className={styles.panelHeaderTitle}>{monthLabel}</p>
      </div>
      <div
        className={styles.panelBody}
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16 }}
      >
        <div>
          <p className={chart.catValue} style={{ margin: 0 }}>Receita lançada</p>
          <p style={{ margin: "2px 0", fontSize: 22, fontWeight: 600, color: "var(--chart-revenue)" }}>
            R$ {formatMoneyDisplay(revenue)}
          </p>
          <Delta current={revenue} previous={prevRevenue} />
        </div>

        <div>
          <p className={chart.catValue} style={{ margin: 0 }}>Despesa do mês</p>
          <p style={{ margin: "2px 0", fontSize: 22, fontWeight: 600, color: "var(--chart-expense)" }}>
            R$ {formatMoneyDisplay(expense)}
          </p>
          <Delta current={expense} previous={prevExpense} />
        </div>

        <div>
          <p className={chart.catValue} style={{ margin: 0 }}>Saldo</p>
          {/* Sinal e palavra, não só cor — "negativo" precisa chegar a quem não
              distingue o vermelho. */}
          <p
            style={{
              margin: "2px 0",
              fontSize: 22,
              fontWeight: 600,
              color: saldo < 0 ? "var(--danger)" : "var(--ink)",
            }}
          >
            {saldo < 0 ? "−" : ""}R$ {formatMoneyDisplay(Math.abs(saldo))}
          </p>
          <span className={chart.catValue}>{saldo < 0 ? "negativo no mês" : "positivo no mês"}</span>
        </div>

        <div>
          <p className={chart.catValue} style={{ margin: 0 }}>A receber</p>
          <p style={{ margin: "2px 0", fontSize: 22, fontWeight: 600, color: "var(--ink-soft)" }}>
            R$ {formatMoneyDisplay(receivable)}
          </p>
          <span className={chart.catValue}>débitos em aberto, acumulado</span>
        </div>
      </div>
    </section>
  );
}
