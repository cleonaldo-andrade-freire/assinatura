-- Anamnese SaaS — templates de prescrição (itens padrão + observações reaproveitáveis)
-- Rode uma vez no SQL Editor do Supabase, depois da 016.

create table prescription_templates (
  id                 uuid primary key default gen_random_uuid(),
  clinic_id          uuid not null references clinics(id) on delete cascade,
  name               text not null,
  -- Itens padrão do modelo, mesmo formato de `prescriptions.items`.
  items              jsonb not null default '[]',
  -- Placeholders suportados (substituídos no cliente/PDF ao usar o modelo):
  -- {{paciente_nome}}, {{paciente_cpf}}, {{data_emissao}}
  notes_template     text,
  created_at         timestamptz not null default now()
);
create index prescription_templates_clinic_id_idx on prescription_templates(clinic_id);

alter table prescription_templates enable row level security;

create policy "manage own prescription templates" on prescription_templates
  for all using (clinic_id in (select clinic_id from profiles where id = auth.uid()));
