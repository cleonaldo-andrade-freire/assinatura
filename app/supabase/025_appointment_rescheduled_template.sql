-- Anamnese SaaS — agenda: modelo de mensagem pra remarcação
-- Rode uma vez no SQL Editor do Supabase, depois da 024.

alter table appointment_message_templates drop constraint appointment_message_templates_template_type_check;
alter table appointment_message_templates add constraint appointment_message_templates_template_type_check
  check (template_type in ('solicitacao', 'lembrete_24h', 'lembrete_final', 'confirmado', 'cancelado', 'remarcado'));
