-- Anamnese SaaS — controle de prótese: remove o estágio "Envio" (simplificação de escopo)
-- Rode uma vez no SQL Editor do Supabase, depois da 026.

-- Qualquer serviço que já esteja em "envio" avança pro próximo estágio real
-- do fluxo (laboratório) — não faz sentido regredir pro pré-laboratório.
update prosthesis_orders set stage = 'laboratorio', stage_since = now() where stage = 'envio';

alter table prosthesis_orders drop constraint prosthesis_orders_stage_check;
alter table prosthesis_orders add constraint prosthesis_orders_stage_check
  check (stage in ('pre_laboratorio', 'laboratorio', 'agenda', 'realizado'));

-- prosthesis_order_events.from_stage/to_stage não tem check constraint (só
-- espelha o texto do evento) — nada a ajustar ali além dos dados históricos,
-- que continuam válidos como registro do que aconteceu.

delete from prosthesis_stage_templates where stage = 'envio';

alter table prosthesis_stage_templates drop constraint prosthesis_stage_templates_stage_check;
alter table prosthesis_stage_templates add constraint prosthesis_stage_templates_stage_check
  check (stage in ('pre_laboratorio', 'laboratorio', 'agenda', 'realizado'));
