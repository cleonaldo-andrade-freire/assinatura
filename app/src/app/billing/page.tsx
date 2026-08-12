import { redirect } from "next/navigation";

// Assinatura/cobrança virou uma seção dentro de Configurações — este
// redirect existe só pra não quebrar links antigos (e-mails, favoritos)
// que ainda apontam pra /billing.
export default function BillingRedirect() {
  redirect("/dashboard/configuracoes#assinatura");
}
