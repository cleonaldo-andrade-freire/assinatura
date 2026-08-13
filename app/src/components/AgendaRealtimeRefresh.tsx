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

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clinicId, router]);

  return null;
}
