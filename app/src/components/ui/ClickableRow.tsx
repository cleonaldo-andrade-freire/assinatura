"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

/** Linha de tabela que navega ao clicar em qualquer lugar (não só no ícone de
 * editar) — mais rápido de usar numa lista, e evita ter que mirar num alvo
 * pequeno. Os botões de ação dentro da linha (editar/excluir) continuam
 * funcionando normalmente porque cada um já para a propagação do clique. */
export function ClickableRow({ href, children }: { href: string; children: ReactNode }) {
  const router = useRouter();
  return (
    <tr className="clickableRow" onClick={() => router.push(href)}>
      {children}
    </tr>
  );
}
