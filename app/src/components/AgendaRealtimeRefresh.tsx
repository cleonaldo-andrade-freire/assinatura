"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/**
 * Sem UI própria — só escuta mudanças em `appointments` da própria clínica
 * (RLS já garante isso no nível do Realtime, o filtro aqui é só pra não
 * processar evento de outra tabela) e atualiza a tela sozinha. É o que
 * cobre "refletir a mudança em tempo real, sem precisar recarregar a
 * página" quando o paciente confirma/cancela pelo link no WhatsApp
 * enquanto a recepção está com a agenda aberta.
 *
 * O Realtime depende de configuração fora do código (a tabela precisa estar
 * na publication `supabase_realtime` — ver migration 023 — e o WebSocket
 * pode cair silenciosamente numa aba esquecida em segundo plano sem
 * reconectar sozinho). Por isso, além da inscrição, um polling de segurança
 * a cada 30s garante que a tela se autocorrige mesmo se o evento de tempo
 * real não chegar por qualquer motivo — o pior caso vira "atualiza em até
 * 30s" em vez de "nunca atualiza sozinho".
 */
export function AgendaRealtimeRefresh({ clinicId }: { clinicId: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`appointments-${clinicId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointments", filter: `clinic_id=eq.${clinicId}` },
        () => router.refresh()
      )
      .subscribe();

    const fallbackInterval = setInterval(() => router.refresh(), 30_000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(fallbackInterval);
    };
  }, [clinicId, router]);

  return null;
}
