-- Anamnese SaaS — planos viram dado editável (antes eram constantes fixas no código)
-- Rode uma vez no SQL Editor do Supabase.

create table plans (
  id text primary key,
  name text not null,
  monthly_price numeric(10, 2) not null,
  monthly_limit int not null,
  features text[] not null default '{}',
  display_order int not null default 0,
  active boolean not null default true,
  featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into plans (id, name, monthly_price, monthly_limit, features, display_order, featured) values
  ('starter', 'Starter', 39.90, 20, '{"1 número de WhatsApp","Modelo de perguntas padrão"}', 1, false),
  ('basic', 'Basic', 59.90, 40, '{"1 número de WhatsApp","Modelo de perguntas padrão"}', 2, false),
  ('standard', 'Standard', 79.90, 60, '{"Perguntas personalizáveis","Suporte prioritário"}', 3, false),
  ('plus', 'Plus', 99.90, 80, '{"Perguntas personalizáveis","Suporte prioritário"}', 4, false),
  ('pro', 'Pro', 129.90, 120, '{"Perguntas personalizáveis","Suporte prioritário"}', 5, true),
  ('enterprise', 'Enterprise', 199.00, 200, '{"Relatórios de uso","Suporte prioritário dedicado"}', 6, false);

alter table plans enable row level security;

create policy "plans são públicos pra leitura" on plans
  for select using (true);
-- Sem policy de insert/update/delete: só a chave de serviço (admin) escreve.

-- Migra clinics.plan/pending_plan do enum "plan" pra texto com FK pra tabela nova.
alter table clinics alter column plan drop default;
alter table clinics alter column plan type text using plan::text;
alter table clinics alter column plan set default 'starter';
alter table clinics add constraint clinics_plan_fkey foreign key (plan) references plans(id);

alter table clinics alter column pending_plan type text using pending_plan::text;
alter table clinics add constraint clinics_pending_plan_fkey foreign key (pending_plan) references plans(id);

drop type plan;
