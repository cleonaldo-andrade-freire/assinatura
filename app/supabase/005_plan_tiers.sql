-- Anamnese SaaS — faixas de plano novas + cobrança de excedente
-- Rode uma vez no SQL Editor do Supabase.

-- Cada ALTER TYPE ... ADD VALUE precisa ser seu próprio statement (não pode
-- estar na mesma transação que já usa o valor novo) — normal ao colar tudo
-- de uma vez no SQL Editor, cada linha roda em sequência.
alter type plan add value 'basic';
alter type plan add value 'standard';
alter type plan add value 'plus';
alter type plan add value 'enterprise';

-- Registro local de cada cobrança avulsa de anamnese excedente disparada no
-- Asaas, pra não depender de re-consultar a API do Asaas na tela de billing.
create table usage_charges (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  anamnesis_id uuid not null references anamneses(id) on delete cascade,
  asaas_payment_id text,
  amount numeric(10, 2) not null,
  created_at timestamptz not null default now()
);
create index usage_charges_clinic_id_idx on usage_charges(clinic_id);

alter table usage_charges enable row level security;

create policy "select own usage charges" on usage_charges
  for select using (clinic_id in (select clinic_id from profiles where id = auth.uid()));
