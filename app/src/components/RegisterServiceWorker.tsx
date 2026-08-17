"use client";

import { useEffect } from "react";

export function RegisterServiceWorker() {
  useEffect(() => {
    // Nunca registra em dev: o sw.js trata /_next/static/* como imutável por
    // URL (verdade só em produção, onde o build tem hash por versão) — em
    // `next dev` o chunk fica no mesmo caminho entre rebuilds, então o cache
    // serve JS velho contra o registro de módulos novo do webpack e quebra
    // com "Cannot read properties of undefined (reading 'call')".
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.error("Falha ao registrar o service worker:", err);
    });
  }, []);

  return null;
}
