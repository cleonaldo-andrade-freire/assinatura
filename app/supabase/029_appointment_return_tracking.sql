-- Anamnese SaaS — retorno vira sinalização, não agendamento automático
-- Rode uma vez no SQL Editor do Supabase, depois da 028.

-- "Retornar em" deixa de criar uma segunda consulta sozinho (o paciente
-- podia não querer aquele dia/horário específico escolhido sem confirmação
-- nenhuma) — agora só marca a data prevista de retorno na própria consulta.
-- return_notified_at controla se a recepção já mandou o lembrete pra esse
-- retorno, pra sumir da lista de "retornos próximos" depois de avisado.
alter table appointments add column return_due_date date;
alter table appointments add column return_notified_at timestamptz;

create index appointments_return_due_idx on appointments(clinic_id, return_due_date) where return_due_date is not null;

-- Modelo de mensagem pro lembrete de retorno — mesmo padrão dos outros
-- momentos do fluxo da agenda.
alter table appointment_message_templates drop constraint appointment_message_templates_template_type_check;
alter table appointment_message_templates add constraint appointment_message_templates_template_type_check
  check (template_type in ('solicitacao', 'lembrete_24h', 'lembrete_final', 'confirmado', 'cancelado', 'remarcado', 'retorno_lembrete'));
