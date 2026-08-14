-- Anamnese SaaS — tratamentos do paciente (gerados ao aprovar um orçamento)
-- Rode uma vez no SQL Editor do Supabase, depois da 033.

-- Cada linha aqui é um procedimento a fazer (ou já feito) num paciente —
-- nasce automaticamente quando um orçamento é aprovado (uma linha por item
-- selecionado do orçamento), mas continua existindo independente do
-- orçamento original (editável/excluível por conta própria).
create table treatments (
  id               uuid primary key default gen_random_uuid(),
  clinic_id        uuid not null references clinics(id) on delete cascade,
  patient_id       uuid not null references patients(id) on delete cascade,
  budget_id        uuid references budgets(id) on delete set null,
  budget_item_id   uuid references budget_items(id) on delete set null,
  price_table_name text,
  treatment_name   text not null,
  tooth_region     text,
  price            numeric(10,2) not null default 0 check (price >= 0),
  dentist_name     text not null,
  status           text not null default 'aberto' check (status in ('aberto', 'finalizado')),
  finalized_at     timestamptz,
  -- Texto de evolução gerado automaticamente ao finalizar (editável antes de
  -- salvar) — quando vários tratamentos são finalizados juntos, cada linha
  -- guarda o mesmo texto (é uma nota sobre aquele atendimento, não por dente).
  evolution_text   text,
  display_order    integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index treatments_patient_id_idx on treatments(patient_id, status);
create index treatments_budget_id_idx on treatments(budget_id);

alter table treatments enable row level security;

create policy "manage own treatments" on treatments
  for all using (clinic_id in (select clinic_id from profiles where id = auth.uid()));
