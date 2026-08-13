-- Anamnese SaaS — agenda: status de falta + modelos de mensagem do WhatsApp por clínica
-- Rode uma vez no SQL Editor do Supabase, depois da 023.

-- "faltou" é diferente de "cancelado": cancelado é uma decisão avisada com
-- antecedência (o horário pode ser realocado numa boa); falta é o paciente
-- simplesmente não aparecer — vale a pena distinguir pra clínica acompanhar
-- padrão de falta por paciente depois. Não entra em FREED_STATUSES (ver
-- lib/appointments.ts): a essa altura o horário já passou, não tem
-- realocação possível pra ele mesmo.
alter table appointments drop constraint appointments_status_check;
alter table appointments add constraint appointments_status_check
  check (status in ('agendado', 'confirmado', 'cancelado_paciente', 'cancelado_dentista', 'atendido', 'faltou'));

-- Modelo de mensagem do WhatsApp por clínica e por momento do fluxo —
-- opcional: se a clínica não personalizar, o código usa o texto padrão
-- (ver DEFAULT_TEMPLATES em lib/appointmentTemplates.ts). Um registro por
-- (clinic_id, template_type), upsert na hora de salvar.
create table appointment_message_templates (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     uuid not null references clinics(id) on delete cascade,
  template_type text not null
                check (template_type in ('solicitacao', 'lembrete_24h', 'lembrete_final', 'confirmado', 'cancelado')),
  body          text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (clinic_id, template_type)
);

alter table appointment_message_templates enable row level security;

create policy "manage own appointment message templates" on appointment_message_templates
  for all using (clinic_id in (select clinic_id from profiles where id = auth.uid()));
