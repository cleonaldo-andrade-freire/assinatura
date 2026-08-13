-- Anamnese SaaS — agenda: novo status "em_atendimento"
-- Rode uma vez no SQL Editor do Supabase, depois da 029.

-- Fica entre "confirmado" e "atendido" — marca que o paciente já está na
-- cadeira, sendo atendido agora. Não é terminal: ainda pode virar
-- "atendido" (concluído) ou um cancelamento/falta se precisar corrigir.
alter table appointments drop constraint appointments_status_check;
alter table appointments add constraint appointments_status_check
  check (status in ('agendado', 'confirmado', 'em_atendimento', 'cancelado_paciente', 'cancelado_dentista', 'atendido', 'faltou'));
