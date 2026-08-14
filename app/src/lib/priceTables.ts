import type { PriceTableItem } from "@/lib/database.types";

/** Favoritos primeiro (ordem estável — preserva especialidade/nome dentro de cada grupo). */
export function sortFavoritesFirst<T extends PriceTableItem>(items: T[]): T[] {
  return [...items].sort((a, b) => Number(b.favorito) - Number(a.favorito));
}

/** Rótulo do item no seletor de tratamento — favorito ganha uma estrela na frente. */
export function treatmentOptionLabel(item: PriceTableItem): string {
  const base = item.specialty ? `${item.specialty} — ${item.name}` : item.name;
  return item.favorito ? `★ ${base}` : base;
}
