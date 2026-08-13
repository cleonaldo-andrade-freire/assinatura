-- Anamnese SaaS — corrige histórico de eventos não gravando pra ações da recepção
-- Rode uma vez no SQL Editor do Supabase, depois da 027.

-- Bug real: appointment_events/prosthesis_order_events só tinham policy de
-- SELECT. A premissa era "eventos só são gravados pelo backend, então não
-- precisa de policy de insert pro usuário autenticado" — mas a maioria das
-- rotas (confirmar, cancelar, atendido, remarcar, criar agendamento, mover
-- estágio de prótese) grava o evento usando o cliente da SESSÃO do próprio
-- usuário logado (createSupabaseServerClient), não a service role — RLS
-- sem policy de insert bloqueia essas gravações silenciosamente (o insert
-- falha, o código não checava o erro, e o histórico ficava sem a linha).
-- Só as ações que passam pelo link público do WhatsApp (confirmar/cancelar
-- pelo paciente) usam a service role e por isso não sofriam com isso.
create policy "insert own clinic appointment events" on appointment_events
  for insert with check (clinic_id in (select clinic_id from profiles where id = auth.uid()));

create policy "insert own clinic prosthesis order events" on prosthesis_order_events
  for insert with check (clinic_id in (select clinic_id from profiles where id = auth.uid()));
