-- Envio ao paciente vira opcional ao finalizar tratamento(s).
-- Rode uma vez no SQL Editor do Supabase, depois da 070.
--
-- Antes, finalizar sempre disparava o pedido de assinatura por WhatsApp e,
-- depois da contra-assinatura da dentista, uma segunda mensagem com o link
-- de validação. Agora o modal de finalização tem a caixa "Enviar ao paciente
-- para assinar por WhatsApp" (desmarcada por padrão) e o valor fica gravado
-- aqui: só com `true` sai a mensagem automática pós-contra-assinatura.
--
-- Default `true` mantém o comportamento das evoluções já existentes e das
-- criadas por outros caminhos (ex.: "Adicionar evolução" no detalhe do
-- tratamento); só a finalização grava o valor escolhido na caixa.
alter table treatment_evolutions
  add column notify_patient boolean not null default true;
