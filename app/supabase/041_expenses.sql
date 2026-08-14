-- Anamnese SaaS — despesas da clínica (fixas/variáveis, com ou sem recorrência)
-- Rode uma vez no SQL Editor do Supabase, depois da 040.

-- Molde de despesa recorrente — não é a despesa em si, é a regra que o
-- cron usa pra gerar uma linha em `expenses` uma vez por mês.
create table recurring_expenses (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null references clinics(id) on delete cascade,
  description  text not null,
  category     text,
  amount       numeric(10,2) not null check (amount >= 0),
  day_of_month integer not null check (day_of_month between 1 and 28),
  active       boolean not null default true,
  created_by   uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index recurring_expenses_clinic_id_idx on recurring_expenses(clinic_id, active);

alter table recurring_expenses enable row level security;
create policy "manage own recurring expenses" on recurring_expenses
  for all using (clinic_id in (select clinic_id from profiles where id = auth.uid()));

-- Uma despesa de verdade — avulsa ou gerada a partir de uma recorrência
-- (`recurring_expense_id` fica nulo se a recorrência for excluída depois;
-- a despesa já gerada não desaparece por isso).
create table expenses (
  id                   uuid primary key default gen_random_uuid(),
  clinic_id            uuid not null references clinics(id) on delete cascade,
  recurring_expense_id uuid references recurring_expenses(id) on delete set null,
  description          text not null,
  category             text,
  amount               numeric(10,2) not null check (amount >= 0),
  due_date             date not null,
  status               text not null default 'pendente' check (status in ('pendente', 'pago')),
  payment_method       text,
  paid_at              timestamptz,
  created_by           uuid references profiles(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index expenses_clinic_id_status_idx on expenses(clinic_id, status);
create index expenses_due_date_idx on expenses(clinic_id, due_date);
create index expenses_recurring_id_idx on expenses(recurring_expense_id);

alter table expenses enable row level security;
create policy "manage own expenses" on expenses
  for all using (clinic_id in (select clinic_id from profiles where id = auth.uid()));
