-- Anamnese SaaS — templates de atestado (texto reaproveitável, com placeholders)
-- Rode uma vez no SQL Editor do Supabase, depois da 013.

create table certificate_templates (
  id                 uuid primary key default gen_random_uuid(),
  clinic_id          uuid not null references clinics(id) on delete cascade,
  name               text not null,
  -- Placeholders suportados (substituídos no cliente ao selecionar o modelo):
  -- {{paciente_nome}}, {{paciente_cpf}}, {{data_emissao}}, {{data_inicio}}, {{dias_afastamento}}
  reason_template    text not null,
  rest_days_default  int,
  created_at         timestamptz not null default now()
);
create index certificate_templates_clinic_id_idx on certificate_templates(clinic_id);

alter table certificate_templates enable row level security;

create policy "manage own certificate templates" on certificate_templates
  for all using (clinic_id in (select clinic_id from profiles where id = auth.uid()));
