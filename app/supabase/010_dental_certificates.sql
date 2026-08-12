-- Anamnese SaaS — módulo de Atestado Odontológico
-- Rode uma vez no SQL Editor do Supabase, depois da 009.

alter table clinics add column dentist_name   text;
alter table clinics add column dentist_cro    text;
alter table clinics add column dentist_cro_uf text;

create table certificates (
  id                          uuid primary key default gen_random_uuid(),
  clinic_id                   uuid not null references clinics(id) on delete cascade,
  token                       uuid unique not null default gen_random_uuid(),

  patient_name                text not null,
  patient_cpf                 text,
  patient_phone               text,

  -- Snapshot do responsável técnico no momento da emissão — o documento não
  -- deve mudar retroativamente se a clínica editar o CRO depois.
  dentist_name                text not null,
  dentist_cro                 text not null,
  dentist_cro_uf              text not null,

  cid                         text,
  hide_cid_on_patient_pdf     boolean not null default false, -- Lei nº 9.436/97
  reason                      text not null,
  rest_days                   int not null default 0,
  starts_on                   date not null default current_date,

  -- rascunho | aguardando_assinatura | assinado | falha
  status                      text not null default 'rascunho',
  signature_provider          text,
  signature_provider_doc_id   text,
  signature_requested_at      timestamptz,
  signed_at                   timestamptz,
  signature_error             text,

  pdf_storage_key             text,
  sha256                      text,
  sent_whatsapp_at            timestamptz,

  created_by                  uuid references profiles(id),
  created_at                  timestamptz not null default now()
);
create index certificates_clinic_id_idx on certificates(clinic_id);

alter table certificates enable row level security;

create policy "select own clinic certificates" on certificates
  for select using (clinic_id in (select clinic_id from profiles where id = auth.uid()));

-- Sem policy de insert/update/delete pra usuários autenticados de propósito —
-- criação e transição de status do atestado sempre passam pela chave de
-- serviço no servidor, mesmo padrão de `anamneses`/`signatures`.
