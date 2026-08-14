-- Anamnese SaaS — débitos financeiros por tratamento + recibos de pagamento
-- Rode uma vez no SQL Editor do Supabase, depois da 039.
--
-- Também precisa de um bucket de Storage novo, criado manualmente (Storage
-- > New bucket, igual "budget-pdfs"): nome receipt-pdfs — privado (não
-- marcar "Public bucket").

create table receipts (
  id               uuid primary key default gen_random_uuid(),
  clinic_id        uuid not null references clinics(id) on delete cascade,
  patient_id       uuid not null references patients(id) on delete cascade,
  patient_name     text not null,
  patient_phone    text,
  total_amount     numeric(10,2) not null check (total_amount >= 0),
  declared_ir      boolean not null default false,
  token            uuid not null default gen_random_uuid() unique,
  pdf_storage_key  text,
  sha256           text,
  sent_whatsapp_at timestamptz,
  created_by       uuid references profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index receipts_patient_id_idx on receipts(patient_id, created_at desc);
create index receipts_clinic_id_idx on receipts(clinic_id, created_at desc);

alter table receipts enable row level security;
create policy "manage own receipts" on receipts
  for all using (clinic_id in (select clinic_id from profiles where id = auth.uid()));

-- Débito financeiro — uma entrada por tratamento com valor > 0 (avulso ou
-- vindo de orçamento aprovado). Tabela separada de `treatments` de
-- propósito: `treatments` guia o lado clínico (odontograma, evolução,
-- status de atendimento); um pagamento parcial gera um segundo débito
-- (não um segundo tratamento), então misturar os dois faria toda query
-- clínica ter que filtrar "débito fantasma". `treatment_id` é anulável
-- (`on delete set null`) — se o tratamento clínico for excluído, o débito
-- já pago sobrevive, porque o dinheiro já mudou de mão de verdade.
create table treatment_debits (
  id             uuid primary key default gen_random_uuid(),
  clinic_id      uuid not null references clinics(id) on delete cascade,
  patient_id     uuid not null references patients(id) on delete cascade,
  treatment_id   uuid references treatments(id) on delete set null,
  description    text not null,
  amount         numeric(10,2) not null check (amount >= 0),
  status         text not null default 'aberto' check (status in ('aberto', 'pago')),
  payment_method text,
  paid_at        timestamptz,
  has_split      boolean not null default false,
  receipt_id     uuid references receipts(id) on delete set null,
  created_by     uuid references profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index treatment_debits_patient_id_idx on treatment_debits(patient_id, status);
create index treatment_debits_treatment_id_idx on treatment_debits(treatment_id);
create index treatment_debits_receipt_id_idx on treatment_debits(receipt_id);

alter table treatment_debits enable row level security;
create policy "manage own treatment debits" on treatment_debits
  for all using (clinic_id in (select clinic_id from profiles where id = auth.uid()));
