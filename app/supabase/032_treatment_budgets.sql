-- Anamnese SaaS — tabelas de tratamento (preço por plano) e orçamentos odontológicos
-- Rode uma vez no SQL Editor do Supabase, depois da 031.

-- "Plano" aqui é o plano de tratamento/convênio da clínica (ex.: "Particular",
-- "Unimed Odonto") — não confundir com o `plan` de assinatura do SaaS
-- (tabela `plans`, cobrança da própria clínica). Cada clínica monta suas
-- próprias tabelas de preço; uma pode ser marcada como padrão.
create table price_tables (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references clinics(id) on delete cascade,
  name       text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index price_tables_clinic_id_idx on price_tables(clinic_id);
-- Só uma tabela padrão por clínica — marcar uma nova como padrão precisa
-- desmarcar a anterior antes (feito na aplicação, dentro da mesma request).
create unique index price_tables_one_default_per_clinic on price_tables(clinic_id) where is_default;

alter table price_tables enable row level security;

create policy "manage own price tables" on price_tables
  for all using (clinic_id in (select clinic_id from profiles where id = auth.uid()));

-- Catálogo de tratamentos com valor, dentro de uma tabela de preço —
-- `specialty` é texto livre (cada clínica organiza do jeito que já usa no
-- consultório, sem taxonomia fixa imposta pelo sistema).
create table price_table_items (
  id             uuid primary key default gen_random_uuid(),
  clinic_id      uuid not null references clinics(id) on delete cascade,
  price_table_id uuid not null references price_tables(id) on delete cascade,
  specialty      text,
  name           text not null,
  price          numeric(10,2) not null check (price >= 0),
  display_order  integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index price_table_items_table_id_idx on price_table_items(price_table_id);

alter table price_table_items enable row level security;

create policy "manage own price table items" on price_table_items
  for all using (clinic_id in (select clinic_id from profiles where id = auth.uid()));

-- Orçamento — mesmo padrão de atestados/prescrições pra entrega ao paciente:
-- token público (link de download do PDF) + storage do PDF assinado/gerado.
create table budgets (
  id                  uuid primary key default gen_random_uuid(),
  clinic_id           uuid not null references clinics(id) on delete cascade,
  patient_id          uuid references patients(id) on delete set null,
  patient_name        text not null,
  patient_phone       text not null,
  description         text not null,
  responsible_name    text not null,
  budget_date         date not null,
  status              text not null default 'em_aberto' check (status in ('em_aberto', 'aprovado')),
  discount_type       text not null default 'fixed' check (discount_type in ('fixed', 'percent')),
  discount_value      numeric(10,2) not null default 0 check (discount_value >= 0),
  installments        integer not null default 1 check (installments >= 1),
  payment_method      text,
  down_payment_value  numeric(10,2) check (down_payment_value >= 0),
  down_payment_method text,
  notes               text,
  token               uuid not null default gen_random_uuid() unique,
  pdf_storage_key     text,
  sha256              text,
  sent_whatsapp_at    timestamptz,
  created_by          uuid references profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index budgets_clinic_id_idx on budgets(clinic_id, created_at desc);
create index budgets_patient_id_idx on budgets(patient_id);

alter table budgets enable row level security;

create policy "manage own budgets" on budgets
  for all using (clinic_id in (select clinic_id from profiles where id = auth.uid()));

-- Linhas de tratamento do orçamento — `price_table_name`/`treatment_name`
-- ficam gravados aqui (não só o id) porque um orçamento já salvo não pode
-- mudar de valor se a tabela de preço mudar depois.
create table budget_items (
  id                  uuid primary key default gen_random_uuid(),
  clinic_id           uuid not null references clinics(id) on delete cascade,
  budget_id           uuid not null references budgets(id) on delete cascade,
  price_table_item_id uuid references price_table_items(id) on delete set null,
  price_table_name    text,
  treatment_name      text not null,
  tooth_region        text,
  price               numeric(10,2) not null check (price >= 0),
  dentist_name        text not null,
  selected            boolean not null default true,
  display_order       integer not null default 0,
  created_at          timestamptz not null default now()
);

create index budget_items_budget_id_idx on budget_items(budget_id);

alter table budget_items enable row level security;

create policy "manage own budget items" on budget_items
  for all using (clinic_id in (select clinic_id from profiles where id = auth.uid()));
