import { chartMax, type CategoryTotal } from "@/lib/financial";
import { formatMoneyDisplay } from "@/lib/money";
import chart from "./chart.module.css";

/**
 * Despesas do mês por categoria, em barras horizontais ordenadas.
 *
 * Horizontal e não pizza: com meia dúzia de categorias, comparar comprimentos
 * alinhados na mesma base é preciso, comparar ângulos de fatia é chute. E os
 * nomes cabem sem girar texto.
 *
 * Uma série só, então sem legenda e com uma cor só — o comprimento da barra já
 * carrega a magnitude, colorir por valor seria codificar a mesma coisa duas
 * vezes.
 */
export function CategoryBars({ items }: { items: CategoryTotal[] }) {
  if (items.length === 0) {
    return <p className={chart.catValue}>Nenhuma despesa lançada neste mês.</p>;
  }

  const max = chartMax(items.map((i) => i.total));

  return (
    <div>
      {items.map((item) => (
        <div key={item.category} className={chart.catRow}>
          <span className={chart.catName} title={item.category}>
            {item.category}
          </span>
          <span className={chart.catTrack}>
            <span
              className={chart.catFill}
              style={{ width: `${Math.max(2, (item.total / max) * 100)}%` }}
              aria-hidden="true"
            />
          </span>
          <span className={chart.catValue}>R$ {formatMoneyDisplay(item.total)}</span>
        </div>
      ))}
    </div>
  );
}
