"use client";

import Link, { type LinkProps } from "next/link";
import type { AnchorHTMLAttributes, ReactNode } from "react";

/**
 * Onde uma linha de tabela virou clicável (ver ClickableRow), qualquer link
 * ou botão dentro dela precisa impedir que o clique suba e dispare também a
 * navegação da linha inteira. `onClick` só pode existir dentro de um Client
 * Component — por isso esses dois wrappers, em vez de um `onClick` cru
 * dentro da página (Server Component), que quebra a serialização do RSC
 * ("Event handlers cannot be passed to Client Component props").
 */
export function StopPropagationTd({ children }: { children: ReactNode }) {
  return <td onClick={(e) => e.stopPropagation()}>{children}</td>;
}

export function StopPropagationLink(props: LinkProps & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <Link {...props} onClick={(e) => e.stopPropagation()} />;
}
