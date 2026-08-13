/**
 * Só existe pra sustentar o slot paralelo `@modal` (detalhe da prótese
 * abrindo por cima do quadro kanban, em vez de navegar pra uma página cheia
 * — ver `@modal/(.)[id]`). Sem isso o slot não é renderizado.
 */
export default function ProsthesisLayout({
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
