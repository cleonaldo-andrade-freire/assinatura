-- Anamnese SaaS — dashboard: listas de "retornos próximos" e "cancelamentos"
-- Rode uma vez no SQL Editor do Supabase, depois da 030.

-- Dispensa manual de cada lista (não apaga o agendamento nem o cadastro do
-- paciente — só tira da lista de acompanhamento). Também é setado
-- automaticamente quando o paciente é reagendado (ver POST /appointments),
-- já que nesse caso o acompanhamento cumpriu o papel dele.
alter table appointments add column return_dismissed_at timestamptz;
alter table appointments add column cancellation_dismissed_at timestamptz;

create index appointments_return_pending_idx on appointments(clinic_id, return_due_date)
  where return_due_date is not null and return_dismissed_at is null;

create index appointments_cancelled_pending_idx on appointments(clinic_id, updated_at)
  where status in ('cancelado_paciente', 'cancelado_dentista');

-- Modelo de mensagem pro contato de reengajamento (dashboard > Cancelamentos).
alter table appointment_message_templates drop constraint appointment_message_templates_template_type_check;
alter table appointment_message_templates add constraint appointment_message_templates_template_type_check
  check (template_type in ('solicitacao', 'lembrete_24h', 'lembrete_final', 'confirmado', 'cancelado', 'remarcado', 'retorno_lembrete', 'cancelamento_contato'));
