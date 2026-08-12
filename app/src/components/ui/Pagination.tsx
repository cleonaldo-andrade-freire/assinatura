import styles from "@/styles/shell.module.css";

interface PaginationProps {
  page: number;
  totalPages: number;
  count: number;
  itemLabel: string;
  /** Só precisa quando o plural não é simplesmente `itemLabel + "s"` (ex.: "prescrição" → "prescrições"). */
  itemLabelPlural?: string;
  hrefFor: (page: number) => string;
}

/** Paginador compartilhado — mesmo padrão visual/comportamental já usado em `dashboard/page.tsx`. */
export function Pagination({ page, totalPages, count, itemLabel, itemLabelPlural, hrefFor }: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className={styles.pagination}>
      <span className={styles.paginationInfo}>
        Página {page} de {totalPages} — {count} {count === 1 ? itemLabel : itemLabelPlural ?? `${itemLabel}s`}
      </span>
      <div className={styles.paginationLinks}>
        <a
          href={hrefFor(Math.max(1, page - 1))}
          className={`${styles.pageLink} ${page === 1 ? styles.pageLinkDisabled : ""}`}
        >
          ‹
        </a>
        {Array.from({ length: totalPages }, (_, i) => i + 1)
          .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
          .map((p, idx, arr) => (
            <span key={p} style={{ display: "flex", gap: 6 }}>
              {idx > 0 && arr[idx - 1] !== p - 1 && (
                <span className={styles.paginationInfo} style={{ padding: "0 2px" }}>
                  …
                </span>
              )}
              <a href={hrefFor(p)} className={`${styles.pageLink} ${p === page ? styles.pageLinkActive : ""}`}>
                {p}
              </a>
            </span>
          ))}
        <a
          href={hrefFor(Math.min(totalPages, page + 1))}
          className={`${styles.pageLink} ${page === totalPages ? styles.pageLinkDisabled : ""}`}
        >
          ›
        </a>
      </div>
    </div>
  );
}
