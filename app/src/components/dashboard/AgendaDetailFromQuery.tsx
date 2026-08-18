"use client";

import { useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import { AppointmentDetailModal } from "@/components/dashboard/AppointmentDetailModal";

/**
 * Lê o query param `?detail=<appointmentId>` e abre o modal de detalhe
 * automaticamente. Usado quando `/dashboard/agenda/[id]` redireciona
 * para `/dashboard/agenda?detail=<id>` para garantir que o detalhe
 * nunca abra como página cheia.
 */
export function AgendaDetailFromQuery({ clinicId }: { clinicId: string }) {
  const searchParams = useSearchParams();
  const detailId = searchParams.get("detail");
  const [mounted, setMounted] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted) setOpenId(detailId);
  }, [mounted, detailId]);

  if (!mounted || !openId) return null;

  return (
    <AppointmentDetailModal
      open={true}
      onClose={() => {
        setOpenId(null);
        // Remove o param da URL sem recarregar
        const url = new URL(window.location.href);
        url.searchParams.delete("detail");
        window.history.replaceState({}, "", url.toString());
      }}
      clinicId={clinicId}
      appointmentId={openId}
    />
  );
}
