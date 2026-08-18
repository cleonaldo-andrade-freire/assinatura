import { redirect } from "next/navigation";

/**
 * Acesso direto a /dashboard/agenda/[id] (via URL, F5, link compartilhado)
 * redireciona para a agenda com query ?detail=<id>, que faz a página da
 * agenda abrir o modal de detalhe automaticamente.
 */
export default function AppointmentDetailPage({ params }: { params: { id: string } }) {
  redirect(`/dashboard/agenda?detail=${params.id}`);
}
