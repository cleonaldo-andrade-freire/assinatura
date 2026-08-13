/**
 * Só existe pra sustentar o slot paralelo `@modal` (detalhe do agendamento
 * abrindo por cima da grade, em vez de navegar pra uma página cheia — ver
 * `@modal/(.)[id]`). Sem isso o slot não é renderizado.
 */
export default function AgendaLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
